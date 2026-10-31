from django.urls import path

from .views import PaymentCreateView

urlpatterns = [
    path("record/", PaymentCreateView.as_view(), name="record-payment"),
]
