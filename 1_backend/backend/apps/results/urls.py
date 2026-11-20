from django.urls import path

from . import views

urlpatterns = [
    path('my/', views.MyResultsView.as_view(), name='results_my'),
    path('test/<int:test_id>/', views.TestResultsView.as_view(), name='results_test'),
    path('test/<int:test_id>/export/', views.TestResultsExportView.as_view(), name='results_export'),
    path('attempt/<int:pk>/', views.AttemptDetailView.as_view(), name='results_attempt'),
    path('test/<int:test_id>/question-analysis/', views.QuestionAnalysisView.as_view(), name='results_question_analysis'),
    path('test/<int:test_id>/grant-attempt/', views.GrantAttemptView.as_view(), name='results_grant_attempt'),
    path('attention/', views.AttentionView.as_view(), name='results_attention'),
    path('my-analytics/', views.MyAnalyticsView.as_view(), name='results_my_analytics'),
    path('my-mistakes/', views.MyMistakesView.as_view(), name='results_my_mistakes'),
    path('practice/', views.PracticeView.as_view(), name='results_practice'),
    path('goals/', views.GoalListCreateView.as_view(), name='results_goals'),
    path('goals/<int:pk>/', views.GoalDetailView.as_view(), name='results_goal'),
    path('students/', views.StudentsListView.as_view(), name='results_students'),
    path('students/<int:pk>/', views.StudentProfileView.as_view(), name='results_student'),
    path('stats/', views.StatsView.as_view(), name='results_stats'),
    path('leaderboard/<int:test_id>/', views.LeaderboardView.as_view(), name='results_leaderboard'),
]
