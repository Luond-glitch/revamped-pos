from django.urls import path

from .api_views import (
    CategoryListCreateView,
    ProductListCreateView,
    StockListView,
)

urlpatterns = [
    path("products/", ProductListCreateView.as_view(), name="api-products"),
    path("categories/", CategoryListCreateView.as_view(), name="api-categories"),
    path("stock/", StockListView.as_view(), name="api-stock"),
]
