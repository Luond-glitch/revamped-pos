from django.urls import path

from .api_views import (
    SupplierListCreateView,
    PurchaseListView,
    ReceivePurchaseView,
    PurchaseCreateView,
)

urlpatterns = [
    path(
    "purchases/create/",
    PurchaseCreateView.as_view(),
    name="api-purchase-create",
    ),
    path(
        "suppliers/",
        SupplierListCreateView.as_view(),
        name="api-suppliers",
    ),
    path(
        "purchases/",
        PurchaseListView.as_view(),
        name="api-purchases",
    ),
    path(
        "purchases/<uuid:purchase_id>/receive/",
        ReceivePurchaseView.as_view(),
        name="api-receive-purchase",
    ),
]
