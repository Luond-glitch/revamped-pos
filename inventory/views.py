from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError as APIValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from businesses.models import Membership
from .models import Category, Product, Stock, StockMovement
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    StockSerializer,
    StockMovementSerializer,
)
from .services import record_stock_movement


INVENTORY_MANAGER_ROLES = {
    "owner",
    "admin",
    "manager",
    "stock_manager",
}


class BusinessScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def active_memberships(self):
        return Membership.objects.filter(
            user=self.request.user,
            is_active=True,
            business__is_active=True,
        )

    def get_business_ids(self):
        return self.active_memberships().values_list(
            "business_id",
            flat=True,
        )

    def require_inventory_manager(self, business_id):
        allowed = self.active_memberships().filter(
            business_id=business_id,
            role__in=INVENTORY_MANAGER_ROLES,
        ).exists()

        if not allowed:
            raise PermissionDenied(
                "You do not have permission to manage this business's inventory."
            )


class CategoryViewSet(BusinessScopedViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        queryset = Category.objects.filter(
            business_id__in=self.get_business_ids()
        ).select_related("business")

        business_id = self.request.query_params.get("business_id")
        if business_id:
            queryset = queryset.filter(business_id=business_id)

        return queryset

    def perform_create(self, serializer):
        business_id = serializer.validated_data["business"].pk
        self.require_inventory_manager(business_id)
        serializer.save()

    def perform_update(self, serializer):
        business_id = serializer.instance.business_id
        self.require_inventory_manager(business_id)

        new_business = serializer.validated_data.get(
            "business",
            serializer.instance.business,
        )
        self.require_inventory_manager(new_business.pk)
        serializer.save()

    def perform_destroy(self, instance):
        self.require_inventory_manager(instance.business_id)
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class ProductViewSet(BusinessScopedViewSet):
    serializer_class = ProductSerializer

    def get_queryset(self):
        queryset = Product.objects.filter(
            business_id__in=self.get_business_ids()
        ).select_related("business", "category")

        business_id = self.request.query_params.get("business_id")
        if business_id:
            queryset = queryset.filter(business_id=business_id)

        return queryset

    def perform_create(self, serializer):
        business_id = serializer.validated_data["business"].pk
        self.require_inventory_manager(business_id)
        serializer.save()

    def perform_update(self, serializer):
        business_id = serializer.instance.business_id
        self.require_inventory_manager(business_id)

        new_business = serializer.validated_data.get(
            "business",
            serializer.instance.business,
        )
        self.require_inventory_manager(new_business.pk)
        serializer.save()

    def perform_destroy(self, instance):
        self.require_inventory_manager(instance.business_id)
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class StockViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        memberships = Membership.objects.filter(
            user=self.request.user,
            is_active=True,
            business__is_active=True,
        )

        queryset = Stock.objects.filter(
            branch__business__in=memberships.values("business_id"),
            branch__is_active=True,
        ).select_related(
            "branch",
            "branch__business",
            "product",
            "product__category",
        )

        branch_id = self.request.query_params.get("branch_id")
        product_id = self.request.query_params.get("product_id")

        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        return queryset

    @action(detail=True, methods=["post"], url_path="movements")
    def movements(self, request, pk=None):
        stock = self.get_object()

        can_manage = Membership.objects.filter(
            user=request.user,
            business_id=stock.branch.business_id,
            is_active=True,
            business__is_active=True,
            role__in=INVENTORY_MANAGER_ROLES,
        ).exists()

        if not can_manage:
            raise PermissionDenied(
                "You do not have permission to change this stock."
            )

        movement_type = request.data.get("movement_type")
        quantity_change = request.data.get("quantity_change")

        if movement_type is None or quantity_change is None:
            raise APIValidationError({
                "detail": "movement_type and quantity_change are required."
            })

        try:
            updated_stock, movement = record_stock_movement(
                stock_id=stock.pk,
                movement_type=movement_type,
                quantity_change=quantity_change,
                reference=request.data.get("reference", ""),
                notes=request.data.get("notes", ""),
            )
        except Stock.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Stock record not found.")
        except ValidationError as exc:
            raise APIValidationError({
                "detail": exc.messages,
            })

        return Response(
            {
                "stock": StockSerializer(
                    updated_stock,
                    context={"request": request},
                ).data,
                "movement": StockMovementSerializer(
                    movement,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        business_ids = Membership.objects.filter(
            user=self.request.user,
            is_active=True,
            business__is_active=True,
        ).values_list("business_id", flat=True)

        queryset = StockMovement.objects.filter(
            stock__branch__business_id__in=business_ids,
        ).select_related(
            "stock",
            "stock__product",
            "stock__branch",
            "stock__branch__business",
        )

        stock_id = self.request.query_params.get("stock_id")
        movement_type = self.request.query_params.get("movement_type")

        if stock_id:
            queryset = queryset.filter(stock_id=stock_id)

        if movement_type:
            queryset = queryset.filter(movement_type=movement_type)

        return queryset
