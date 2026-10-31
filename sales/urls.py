from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SaleViewSet
from .views_receipts import SaleReceiptView


router = DefaultRouter()
router.register("", SaleViewSet, basename="sale")

urlpatterns = [
    path("<uuid:sale_id>/receipt/", SaleReceiptView.as_view(), name="sale-receipt"),
    path("", include(router.urls)),
]
