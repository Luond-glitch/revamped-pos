from rest_framework import serializers

from .models import Supplier, Purchase, PurchaseItem


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"
        read_only_fields = ["id"]


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = "__all__"
        read_only_fields = ["id", "purchase"]


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)

    class Meta:
        model = Purchase
        fields = "__all__"
        read_only_fields = ["id"]


class CreatePurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(
        many=True,
        write_only=True,
    )

    class Meta:
        model = Purchase
        fields = [
            "id",
            "business",
            "branch",
            "supplier",
            "reference_number",
            "notes",
            "items",
        ]
        read_only_fields = ["id"]

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError(
                "Provide at least one purchase item."
            )
        return items

