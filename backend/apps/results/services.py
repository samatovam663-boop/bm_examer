from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import ExtraAttempt, PracticeProgress, TestAttempt
from .serializers import AttemptSerializer

# tarmoq kechikishi uchun qo'shimcha vaqt
GRACE = timedelta(seconds=10)
# savol ketma-ket shuncha marta to'g'ri mashq qilinsa, "o'zlashtirildi" hisoblanadi
MASTER_STREAK = 2


def attempt_expires_at(attempt):
    """Urinish tugash vaqti: boshlanishdan davomiylik o'tgach, lekin test ends_at (bo'lsa) dan keyin emas."""
    end = attempt.started_at + timedelta(minutes=attempt.test.duration_minutes)
    if attempt.test.ends_at and attempt.test.ends_at < end:
        end = max(attempt.test.ends_at, attempt.started_at)
    return end


def get_open_attempt(test, student):
    """Studentning ochiq urinishi. Vaqti o'tgan bo'lsa avtomatik yakunlanadi va None qaytadi."""
    attempt = (TestAttempt.objects.filter(test=test, student=student, is_completed=False)
               .select_related('test').first())
    if attempt and timezone.now() > attempt_expires_at(attempt) + GRACE:
        grade_attempt(attempt)
        return None
    return attempt


def extra_attempts(test, student):
    return ExtraAttempt.objects.filter(test=test, student=student).values_list('count', flat=True).first() or 0


def question_ok(question, selected, correct):
    """Javob to'g'rimi: bekor qilingan savol hammaga to'g'ri; aks holda tanlangan to'plam to'g'ri to'plamga teng bo'lishi kerak."""
    if question.voided:
        return True
    return bool(selected) and selected == correct


def selections(attempt):
    """{question_id: {choice_id, ...}} urinishdagi javoblar."""
    out = {}
    for answer in attempt.answers.prefetch_related('selected_choices'):
        out[answer.question_id] = {sc.choice_id for sc in answer.selected_choices.all()}
    return out


def _evaluate(attempt, questions):
    """Ballni savollarning HOZIRGI holatiga qarab hisoblaydi va Answer qatorlarini yangilaydi (qayta baholash uchun ham ishlaydi)."""
    answers = {a.question_id: a for a in attempt.answers.prefetch_related('selected_choices')}
    total_points = score = correct_count = 0
    for q in questions:
        total_points += q.points
        answer = answers.get(q.id)
        selected = {sc.choice_id for sc in answer.selected_choices.all()} if answer else set()
        correct = {c.id for c in q.choices.all() if c.is_correct}
        ok = question_ok(q, selected, correct)
        if answer:
            answer.is_correct = ok
            answer.points_earned = q.points if ok else 0
            answer.save(update_fields=['is_correct', 'points_earned'])
        if ok:
            score += q.points
            correct_count += 1
    attempt.score = score
    attempt.total_questions = len(questions)
    attempt.correct_answers = correct_count
    attempt.percentage = round(score / total_points * 100, 2) if total_points else 0


@transaction.atomic
def grade_attempt(attempt, tab_switches=None, violation=False):
    """Urinishni baholaydi va yopadi. Qayta chaqirilsa hech narsa o'zgarmaydi.
    violation=True: o'quvchi boshqa tab/oynaga o'tgani uchun bloklangan (faqat berilgan javoblar baholanadi)."""
    if attempt.is_completed:
        return attempt
    attempt.violation = bool(violation)
    _evaluate(attempt, list(attempt.test.questions.prefetch_related('choices')))
    # vaqt tugagandan keyin yuborilgan bo'lsa ham, tugash vaqti limitdan oshmaydi
    attempt.finished_at = min(timezone.now(), attempt_expires_at(attempt))
    attempt.is_completed = True
    if tab_switches is not None:
        attempt.tab_switches = max(attempt.tab_switches, int(tab_switches))
    attempt.save()
    return attempt


@transaction.atomic
def regrade_test(test):
    """Savol tuzatilgandan keyin testning barcha yakunlangan urinishlari qayta baholanadi. Qaytadi: urinishlar soni."""
    questions = list(test.questions.prefetch_related('choices'))
    attempts = list(test.attempts.filter(is_completed=True))
    for attempt in attempts:
        _evaluate(attempt, questions)
        attempt.save(update_fields=['score', 'total_questions', 'correct_answers', 'percentage'])
    return len(attempts)


def build_attempt_detail(attempt, viewer, context=None):
    """Urinish natijasi; qancha tafsilot ko'rsatilishi test.show_results ga bog'liq.
    Teacher/admin har doim to'liq ko'radi."""
    data = dict(AttemptSerializer(attempt, context=context or {}).data)
    level = 'detailed' if viewer.role in ('teacher', 'admin') else attempt.test.show_results
    data['visibility'] = level
    if level == 'score_only':
        return data

    answers = {a.question_id: a for a in attempt.answers.prefetch_related('selected_choices')}
    items = []
    for q in attempt.test.questions.prefetch_related('choices'):
        choices = list(q.choices.all())
        item = {
            'question_id': q.id, 'text': q.text, 'question_type': q.question_type, 'points': q.points,
            'topic': q.topic, 'image': q.image.url if q.image else None,
            'choices': [{'id': c.id, 'text': c.text, 'is_correct': c.is_correct} for c in choices],
            'correct_choice_ids': [c.id for c in choices if c.is_correct],
        }
        if q.voided:
            item['voided'] = True
        if level == 'detailed':
            answer = answers.get(q.id)
            selected = {sc.choice_id for sc in answer.selected_choices.all()} if answer else set()
            ok = question_ok(q, selected, set(item['correct_choice_ids']))
            item['selected_choice_ids'] = sorted(selected)
            item['is_correct'] = ok
            item['points_earned'] = q.points if ok else 0
        items.append(item)
    data['questions'] = items
    return data


def leaderboard(test, limit=None):
    """Har bir student uchun eng yaxshi urinish: foiz kamayish, vaqt o'sish tartibida."""
    attempts = test.attempts.filter(is_completed=True).select_related('student')
    best, counts = {}, {}
    for a in attempts:
        counts[a.student_id] = counts.get(a.student_id, 0) + 1
        duration = (a.finished_at - a.started_at).total_seconds() if a.finished_at else 0
        key = (-a.percentage, duration)
        if a.student_id not in best or key < best[a.student_id][0]:
            best[a.student_id] = (key, a, duration)
    ordered = sorted(best.values(), key=lambda t: t[0])
    rows = []
    for rank, (_, a, duration) in enumerate(ordered, start=1):
        rows.append({
            'rank': rank, 'student': a.student_id, 'student_name': a.student.get_full_name() or a.student.username,
            'best_percentage': a.percentage, 'best_score': a.score, 'duration_seconds': int(duration),
            'attempts': counts[a.student_id], 'attempt_id': a.id,
        })
    return rows[:limit] if limit else rows


# ---------- tahlil ----------

def _pct(correct, total):
    return round(correct / total * 100, 1) if total else 0


def _bump(bucket, key, ok):
    item = bucket.setdefault(key, {'name': key, 'total': 0, 'correct': 0})
    item['total'] += 1
    item['correct'] += 1 if ok else 0


def _finish(bucket):
    return [{**v, 'percent': _pct(v['correct'], v['total'])} for v in bucket.values()]


def _questions_of(test, cache):
    if test.id not in cache:
        qs = list(test.questions.prefetch_related('choices'))
        cache[test.id] = [(q, {c.id for c in q.choices.all() if c.is_correct}) for q in qs]
    return cache[test.id]


def topic_stats(attempts):
    """Urinishlar bo'yicha mavzu tahlili (zaifi birinchi). Faqat teacher/admin uchun (yashirin ma'lumot sizib chiqmaydi)."""
    cache, topics = {}, {}
    for a in attempts:
        sel = selections(a)
        for q, correct in _questions_of(a.test, cache):
            _bump(topics, q.topic or 'Mavzusiz', question_ok(q, sel.get(q.id, set()), correct))
    return sorted(_finish(topics), key=lambda x: x['percent'])


def my_analytics(student):
    """O'quvchi tahlili: mavzu, savol turi, qiyinlik. FAQAT natijasi 'batafsil' ko'rsatiladigan testlar hisobga olinadi,
    aks holda o'qituvchi yashirgan javoblar shu orqali sizib chiqadi."""
    cache, topics, types, levels = {}, {}, {}, {}
    used, hidden = 0, set()
    attempts = (TestAttempt.objects.filter(student=student, is_completed=True).select_related('test'))
    for a in attempts:
        if a.test.show_results != 'detailed':
            hidden.add(a.test_id)
            continue
        used += 1
        sel = selections(a)
        for q, correct in _questions_of(a.test, cache):
            ok = question_ok(q, sel.get(q.id, set()), correct)
            _bump(topics, q.topic or 'Mavzusiz', ok)
            _bump(types, q.question_type, ok)
            _bump(levels, q.difficulty, ok)
    return {'topics': _finish(topics), 'types': _finish(types), 'levels': _finish(levels),
            'attempts_used': used, 'hidden_tests': len(hidden)}


def _wrong_questions(student):
    """{question_id: {'wrong': n, 'last': attempt}} (faqat 'batafsil' testlar)."""
    cache, result = {}, {}
    attempts = (TestAttempt.objects.filter(student=student, is_completed=True, test__show_results='detailed')
                .select_related('test', 'test__subject').order_by('finished_at'))
    for a in attempts:
        sel = selections(a)
        for q, correct in _questions_of(a.test, cache):
            if not question_ok(q, sel.get(q.id, set()), correct):
                cur = result.setdefault(q.id, {'question': q, 'wrong': 0, 'last': None, 'selected': set()})
                cur['wrong'] += 1
                cur['last'] = a
                cur['selected'] = sel.get(q.id, set())
    return result


def my_mistakes(student, request=None):
    wrong = _wrong_questions(student)
    streaks = dict(PracticeProgress.objects.filter(student=student, question_id__in=wrong).values_list('question_id', 'streak'))
    items = []
    for qid, w in wrong.items():
        q, last = w['question'], w['last']
        streak = streaks.get(qid, 0)
        items.append({
            'question_id': q.id, 'test': last.test_id, 'test_title': last.test.title,
            'subject_name': last.test.subject.name if last.test.subject else None, 'topic': q.topic, 'text': q.text,
            'question_type': q.question_type,
            'image': (request.build_absolute_uri(q.image.url) if request and q.image else (q.image.url if q.image else None)),
            'points': q.points,
            'choices': [{'id': c.id, 'text': c.text, 'is_correct': c.is_correct} for c in q.choices.all()],
            'selected_choice_ids': sorted(w['selected']), 'wrong_count': w['wrong'],
            'last_attempt_at': last.finished_at, 'practice_streak': streak, 'mastered': streak >= MASTER_STREAK,
        })
    items.sort(key=lambda m: m['last_attempt_at'], reverse=True)
    items.sort(key=lambda m: m['mastered'])
    return items


def practice(student, question_id, choice_ids):
    """Xato qilingan savolni qayta yechish. Faqat o'quvchining mistakes ro'yxatidagi savollar uchun."""
    wrong = _wrong_questions(student)
    if question_id not in wrong:
        return None
    q = wrong[question_id]['question']
    correct = {c.id for c in q.choices.all() if c.is_correct}
    ok = bool(choice_ids) and set(choice_ids) == correct
    progress, _ = PracticeProgress.objects.get_or_create(student=student, question=q)
    progress.streak = progress.streak + 1 if ok else 0
    progress.save()
    return {'correct': ok, 'correct_choice_ids': sorted(correct), 'streak': progress.streak,
            'mastered': progress.streak >= MASTER_STREAK}


def question_analysis(test):
    """Savol bo'yicha: to'g'ri javob foizi va variantlar taqsimoti (teacher uchun)."""
    attempts = list(test.attempts.filter(is_completed=True))
    sels = [selections(a) for a in attempts]
    n = len(attempts)
    items = []
    for number, q in enumerate(test.questions.prefetch_related('choices'), start=1):
        correct = {c.id for c in q.choices.all() if c.is_correct}
        counts = {c.id: 0 for c in q.choices.all()}
        blank = ok = 0
        for sel in sels:
            chosen = sel.get(q.id, set())
            if not chosen:
                blank += 1
            for cid in chosen:
                if cid in counts:
                    counts[cid] += 1
            if not q.voided and question_ok(q, chosen, correct):
                ok += 1
        items.append({
            'question_id': q.id, 'number': number, 'text': q.text, 'question_type': q.question_type, 'topic': q.topic,
            'points': q.points, 'voided': q.voided, 'corrected_at': q.corrected_at, 'answered': n, 'blank': blank,
            'correct_percent': _pct(ok, n) if n else None,
            'choices': [{'id': c.id, 'text': c.text, 'is_correct': c.is_correct, 'selected': counts[c.id],
                         'percent': _pct(counts[c.id], n)} for c in q.choices.all()],
        })
    return {'attempts_count': n, 'questions': items}
