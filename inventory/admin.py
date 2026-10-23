from django.contrib import admin
from .models import Category,Product,Stock,StockMovement
# Register your models here.
@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
 list_display=("name","business","is_active","created_at")
 search_fields=("name","business__name")
 list_filter=("business","is_active")
 
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
 list_display=("name","sku","business","category","selling_price","is_active")
 search_fields=("name","sku","barcode")
 list_filter=("business","category","is_active",)
 readonly_fields=("id","created_at","updated_at")

@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
 list_display=("product","branch","quantity","reorder_level","updated_at")
 search_fields=("product__name","product__sku","branch__name")
 list_filter=("branch",)

@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
 list_display=("stock","movement_type","quantity_change","reference","created_at")
 search_fields=("stock__product__name","reference")
 list_filter=("movement_type","created_at")
 readonly_fields=("id","created_at")
