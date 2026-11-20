from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('tests', views.TestViewSet, basename='test')
router.register('questions', views.QuestionViewSet, basename='question')

# aniq yo'llar router'dan oldin turishi kerak (questions/import/ ni {id} deb o'qimasligi uchun)
urlpatterns = [
    path('questions/import/', views.QuestionImportView.as_view(), name='question_import'),
    path('questions/bulk/', views.QuestionBulkView.as_view(), name='question_bulk'),
    path('questions/generate/', views.QuestionGenerateView.as_view(), name='question_generate'),
    path('questions/export/<int:test_id>/', views.QuestionExportView.as_view(), name='question_export'),
] + router.urls
