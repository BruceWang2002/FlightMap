from django.db import models


class AircraftCurrent(models.Model):
    icao24 = models.CharField(max_length=6, primary_key=True)
    callsign = models.CharField(max_length=16, blank=True)
    origin_country = models.CharField(max_length=64, blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    altitude_m = models.FloatField(null=True, blank=True)
    velocity_ms = models.FloatField(null=True, blank=True)
    track_deg = models.FloatField(null=True, blank=True)
    vertical_rate_ms = models.FloatField(null=True, blank=True)
    observed_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["callsign", "icao24"]


class AircraftPosition(models.Model):
    aircraft = models.ForeignKey(AircraftCurrent, on_delete=models.CASCADE, related_name="positions")
    latitude = models.FloatField()
    longitude = models.FloatField()
    altitude_m = models.FloatField(null=True, blank=True)
    track_deg = models.FloatField(null=True, blank=True)
    velocity_ms = models.FloatField(null=True, blank=True)
    observed_at = models.DateTimeField()

    class Meta:
        ordering = ["observed_at"]
        indexes = [models.Index(fields=["aircraft", "observed_at"])]


class Airport(models.Model):
    ident = models.CharField(max_length=12, primary_key=True)
    name = models.CharField(max_length=128)
    airport_type = models.CharField(max_length=32, default="small_airport")
    country = models.CharField(max_length=2, blank=True)
    municipality = models.CharField(max_length=64, blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["name"]
