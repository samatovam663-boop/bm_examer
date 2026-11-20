from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """?page=2&page_size=50. Eksport va ro'yxatlar uchun page_size katta bo'lishi mumkin."""
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 10000
