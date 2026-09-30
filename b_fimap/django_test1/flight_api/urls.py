from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("aircraft/", views.aircraft_collection),
    path("aircraft/<str:icao24>/track/", views.aircraft_track),
    path("airports/", views.airport_collection),
]
