from django.contrib import admin
from .models import Sale,SaleItem,Customer
# Register your models here.
@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
 list_display=("name","business","phone_number","is_active","created_at")
 search_fields=("name","phone_number","email")
 list_filter=("business","is_active")

class SaleItemInline(admin.TabularInline):
 model=SaleItem
 extra=0
 readonly_fields=("created_at",)

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
 list_display=("receipt_number","business","branch","cashier","status","total_amount","created_at")
 search_fields=("receipt_number","cashier__username")
 list_filter=("business","branch","status","created_at")
 readonly_fields=("id","created_at","updated_at")
 inlines=[SaleItemInline]

@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
 list_display=("product_name","sku","sale","quantity","unit_price","line_total")
 search_fields=("product_name","sku")
 

