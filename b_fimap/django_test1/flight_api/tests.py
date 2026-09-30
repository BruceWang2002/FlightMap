from django.test import TestCase
from django.utils import timezone
from .models import AircraftCurrent, AircraftPosition, Airport


class FlightApiTests(TestCase):
    def setUp(self):
        self.aircraft = AircraftCurrent.objects.create(icao24="abc123", callsign="TEST123", origin_country="Testland", latitude=50, longitude=8, altitude_m=1000, velocity_ms=200, track_deg=90, observed_at=timezone.now())
        AircraftPosition.objects.create(aircraft=self.aircraft, latitude=49.9, longitude=7.9, observed_at=timezone.now())
        Airport.objects.create(ident="TEST", name="Test Airport", latitude=50.1, longitude=8.1)

    def test_aircraft_is_feature_collection(self):
        response = self.client.get("/api/v1/aircraft/?bbox=7,49,9,51")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(payload["features"][0]["properties"]["icao24"], "abc123")

    def test_track_and_airports(self):
        self.assertEqual(len(self.client.get("/api/v1/aircraft/abc123/track/").json()["features"]), 1)
        self.assertEqual(len(self.client.get("/api/v1/airports/").json()["features"]), 1)

    def test_invalid_bbox_returns_400(self):
        self.assertEqual(self.client.get("/api/v1/aircraft/?bbox=bad").status_code, 400)
