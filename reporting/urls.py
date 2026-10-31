from django.urls import path

from .dashboard_api import POSDashboardView
from .views import (
    DashboardReportView,
    SalesReportView,
    InventoryReportView,
    PurchasingReportView,
)

urlpatterns = [
    path("pos-dashboard/", POSDashboardView.as_view(), name="pos-dashboard"),
    path("dashboard/", DashboardReportView.as_view(), name="dashboard-report"),
    path("sales/", SalesReportView.as_view(), name="sales-report"),
    path("inventory/", InventoryReportView.as_view(), name="inventory-report"),
    path("purchasing/", PurchasingReportView.as_view(), name="purchasing-report"),
]
