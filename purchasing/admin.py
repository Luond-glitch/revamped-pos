from django.contrib import admin
from .models import Supplier, Purchase, PurchaseItem


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "business",
        "phone_number",
        "is_active",
    )
    search_fields = ("name", "phone_number", "email")
    list_filter = ("business", "is_active")


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "reference_number",
        "business",
        "branch",
        "supplier",
        "status",
        "total_amount",
        "created_at",
    )
    list_filter = ("business", "branch", "status")
    search_fields = ("reference_number", "supplier__name")
    inlines = [PurchaseItemInline]
    readonly_fields = ("id", "created_at", "received_at")


@admin.register(PurchaseItem)
class PurchaseItemAdmin(admin.ModelAdmin):
    list_display = (
        "purchase",
        "product",
        "quantity",
        "unit_cost",
        "line_total",
    )
