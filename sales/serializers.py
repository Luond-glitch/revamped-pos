from decimal import Decimal
from rest_framework import serializers

from businesses.models import Business, Branch
from inventory.models import Product


class SaleItemInputSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )


class CreateSaleSerializer(serializers.Serializer):
    checkout_key = serializers.UUIDField()

    business_id = serializers.UUIDField()
    branch_id = serializers.UUIDField()

    customer_id = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )

    discount_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=0,
    )

    tax_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=0,
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

    items = SaleItemInputSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        business = Business.objects.filter(
            pk=attrs["business_id"],
            is_active=True,
        ).first()

        if business is None:
            raise serializers.ValidationError({
                "business_id": "The selected business is unavailable."
            })

        branch = Branch.objects.filter(
            pk=attrs["branch_id"],
            business=business,
            is_active=True,
        ).first()

        if branch is None:
            raise serializers.ValidationError({
                "branch_id": "The selected branch is unavailable."
            })

        product_ids = [item["product_id"] for item in attrs["items"]]

        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError({
                "items": "Each product must appear only once."
            })

        products = Product.objects.filter(
            pk__in=product_ids,
            business=business,
            is_active=True,
        )

        products_by_id = {product.pk: product for product in products}

        if len(products_by_id) != len(product_ids):
            raise serializers.ValidationError({
                "items": "One or more products are unavailable."
            })

        attrs["business"] = business
        attrs["branch"] = branch
        attrs["products"] = products_by_id

        return attrs
