from django.urls import path

from .views import (
    RegisterAPIView,
    LoginAPIView,
    CurrentUserAPIView,
)

urlpatterns = [
    path("register/", RegisterAPIView.as_view(), name="register"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("me/", CurrentUserAPIView.as_view(), name="current-user"),
]
