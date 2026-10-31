from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    SupplierViewSet,
    PurchaseViewSet,
    CreatePurchaseView,
    ReceivePurchaseView,
)

router = DefaultRouter()

router.register(
    "suppliers",
    SupplierViewSet,
    basename="supplier",
)

router.register(
    "purchases",
    PurchaseViewSet,
    basename="purchase",
)

urlpatterns = [
    path("", include(router.urls)),
    path(
        "purchases/create/",
        CreatePurchaseView.as_view(),
        name="create-purchase",
    ),
    path(
        "purchases/<uuid:purchase_id>/receive/",
        ReceivePurchaseView.as_view(),
        name="receive-purchase",
    ),
]
