from django.contrib import admin
from .models import Business,Branch,Membership,BranchAssignment
# Register your models here.

@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
 list_display=("name","industry","currency","is_active","created_at")
 search_fields=("name","slug")
 list_filter=("industry","is_active")
 readonly_fields=("id","created_at","updated_at")

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
 list_display=("name","business","code","is_active")
 search_fields=("name","code","business_name")
 list_filter=("is_active","business")

@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
 list_display=("user","business","role","is_active","joined_at")
 search_fields=("user__username","business__name")
 list_filter=("role","is_active","business")

@admin.register(BranchAssignment)
class BranchAssignmentAdmin(admin.ModelAdmin):
 list_display=("membership","branch","assigned_at")
 list_filter=("branch",)
 readonly_fields=("assigned_at",)
