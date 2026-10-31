from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from .models import Membership, Branch


@login_required
@require_GET
def my_businesses(request):
    """
    Return the active businesses the logged-in user belongs to.
    """
    memberships = (
        Membership.objects
        .filter(
            user=request.user,
            is_active=True,
            business__is_active=True,
        )
        .select_related("business")
        .order_by("business__name")
    )

    businesses = [
        {
            "id": str(membership.business_id),
            "name": membership.business.name,
            "role": membership.role,
            "currency": membership.business.currency,
        }
        for membership in memberships
    ]

    return JsonResponse({"results": businesses})


@login_required
@require_GET
def my_branches(request):
    """
    Return active branches the user is permitted to access.

    If the user's membership has branch assignments, only those
    assigned branches are returned. If no assignments exist, all
    active branches belonging to that business are returned.
    """
    business_id = request.GET.get("business_id")

    if not business_id:
        return JsonResponse(
            {"detail": "business_id is required."},
            status=400,
        )

    membership = (
        Membership.objects
        .filter(
            user=request.user,
            business_id=business_id,
            is_active=True,
            business__is_active=True,
        )
        .select_related("business")
        .first()
    )

    if membership is None:
        return JsonResponse(
            {"detail": "You do not have access to this business."},
            status=403,
        )

    branches = Branch.objects.filter(
        business=membership.business,
        is_active=True,
    )

    assignments = membership.staff_assignment.all()

    if assignments.exists():
        assigned_branch_ids = assignments.values_list(
            "branch_id",
            flat=True,
        )
        branches = branches.filter(id__in=assigned_branch_ids)

    branches = branches.order_by("name")

    results = [
        {
            "id": str(branch.id),
            "name": branch.name,
            "code": branch.code,
        }
        for branch in branches
    ]

    return JsonResponse({"results": results})
