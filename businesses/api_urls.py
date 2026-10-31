from django.urls import path

from . import api_views

urlpatterns = [
    path("", api_views.my_businesses, name="my-businesses"),
    path("branches/", api_views.my_branches, name="my-branches"),
]
