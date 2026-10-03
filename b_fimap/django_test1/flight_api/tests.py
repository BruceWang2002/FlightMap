from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from .models import AircraftCurrent, AircraftPosition, Airport
from unittest.mock import patch, MagicMock
from django.core.cache import cache
import json


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

    def test_archived_track_uses_last_observation_and_keeps_newest_points(self):
        self.aircraft.positions.all().delete()
        start = timezone.now() - timedelta(days=90)
        for index in range(4):
            AircraftPosition.objects.create(aircraft=self.aircraft, latitude=50,
                longitude=8 + index / 10, observed_at=start + timedelta(minutes=index))
        path = '/api/v1/aircraft/abc123/track/'
        self.assertEqual(self.client.get(path).json()['features'], [])
        payload = self.client.get(path + '?reference=latest&limit=2').json()
        self.assertEqual([item['geometry']['coordinates'][0] for item in payload['features']], [8.2, 8.3])
        self.assertEqual(payload['metadata']['reference'], 'latest')
        self.assertEqual(self.client.get(path + '?reference=invalid').status_code, 400)

    def test_airport_metadata_preserves_missing_and_actual_values(self):
        airport = Airport.objects.get(ident='TEST')
        airport.metadata = {'gps_code': 'TEST', 'elevation_ft': 0, 'home_link': 'https://example.com'}
        airport.save()
        properties = self.client.get('/api/v1/airports/').json()['features'][0]['properties']
        self.assertEqual(properties['gps_code'], 'TEST')
        self.assertEqual(properties['elevation_ft'], 0)
        self.assertIsNone(properties['source_updated_at'])


class WeatherApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.payload = {'latitude': 50, 'longitude': 8,
            'current': {'time': '2026-10-03T12:00', 'temperature_2m': 0, 'wind_speed_10m': 4},
            'hourly': {'time': ['2026-10-03T12:00', '2026-10-03T13:00'], 'temperature_2m': [0, 1]}}
        self.path = '/api/v1/weather/?latitude=50&longitude=8'

    def upstream(self, payload=None):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload or self.payload).encode()
        return response

    def test_invalid_coordinates_never_call_upstream(self):
        with patch('flight_api.weather.urlopen') as remote:
            for query in ['', 'latitude=nan&longitude=8', 'latitude=91&longitude=8', 'latitude=50&longitude=inf']:
                self.assertEqual(self.client.get('/api/v1/weather/?' + query).status_code, 400)
            remote.assert_not_called()

    def test_valid_response_units_utc_zero_values_and_missing_values(self):
        with patch('flight_api.weather.urlopen', return_value=self.upstream()) as remote:
            response = self.client.get(self.path)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['current']['temperature_2m'], 0)
        self.assertIsNone(payload['current']['precipitation'])
        self.assertEqual(payload['current']['time'], '2026-10-03T12:00:00+00:00')
        self.assertEqual(payload['metadata']['units']['wind_speed'], 'm/s')
        self.assertIn('wind_speed_unit=ms', remote.call_args.args[0])
        self.assertEqual(remote.call_args.kwargs['timeout'], 8)

    def test_cache_reuses_upstream_and_stale_fallback_is_labelled(self):
        with patch('flight_api.weather.urlopen', return_value=self.upstream()) as remote:
            first = self.client.get(self.path).json()
            second = self.client.get(self.path).json()
            self.assertEqual(remote.call_count, 1)
        self.assertFalse(first['metadata']['cached'])
        self.assertTrue(second['metadata']['cached'])
        cache.delete('weather:v1:50.0:8.0')
        with patch('flight_api.weather.urlopen', side_effect=OSError('offline')):
            stale = self.client.get(self.path).json()
        self.assertTrue(stale['metadata']['stale'])
        self.assertEqual(stale['metadata']['fetched_at'], first['metadata']['fetched_at'])

    def test_outage_and_malformed_responses_return_controlled_errors(self):
        with patch('flight_api.weather.urlopen', side_effect=OSError('offline')):
            self.assertEqual(self.client.get(self.path).status_code, 503)
        with patch('flight_api.weather.urlopen', return_value=self.upstream({'current': {}})):
            self.assertEqual(self.client.get(self.path).status_code, 503)

    def test_rate_limit_and_get_only(self):
        self.assertEqual(self.client.post(self.path).status_code, 405)
        with patch('flight_api.weather.urlopen', return_value=self.upstream()):
            for _ in range(20):
                self.assertEqual(self.client.get(self.path).status_code, 200)
            response = self.client.get(self.path)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '60')
