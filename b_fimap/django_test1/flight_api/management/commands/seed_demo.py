from datetime import timedelta
from math import sin, pi
from django.core.management.base import BaseCommand
from django.utils import timezone
from flight_api.models import AircraftCurrent, AircraftPosition, Airport

AIRCRAFT = [
    ("4ca123", "RYR82AB", "Ireland", 50.08, 8.56, 10668, 236, 78),
    ("3c65ab", "DLH4KM", "Germany", 49.72, 10.21, 9144, 228, 244),
    ("406a12", "BAW938", "United Kingdom", 51.02, 3.96, 11278, 250, 112),
    ("4851f5", "KLM68P", "Netherlands", 52.31, 5.68, 10058, 241, 135),
    ("4b1809", "SWR43Y", "Switzerland", 47.78, 7.15, 7925, 210, 48),
]
AIRPORTS = [
    ("EDDF", "Frankfurt Airport", "large_airport", "DE", "Frankfurt", 50.0379, 8.5622),
    ("EHAM", "Amsterdam Airport Schiphol", "large_airport", "NL", "Amsterdam", 52.3086, 4.7639),
    ("EGLL", "London Heathrow Airport", "large_airport", "GB", "London", 51.4700, -0.4543),
    ("EDDM", "Munich Airport", "large_airport", "DE", "Munich", 48.3538, 11.7861),
]


class Command(BaseCommand):
    help = "Load deterministic European demo data for local development."

    def handle(self, *args, **options):
        now = timezone.now()
        for ident, name, airport_type, country, municipality, latitude, longitude in AIRPORTS:
            Airport.objects.update_or_create(ident=ident, defaults={"name": name, "airport_type": airport_type, "country": country, "municipality": municipality, "latitude": latitude, "longitude": longitude})
        for icao24, callsign, country, latitude, longitude, altitude, velocity, track in AIRCRAFT:
            aircraft, _ = AircraftCurrent.objects.update_or_create(icao24=icao24, defaults={"callsign": callsign, "origin_country": country, "latitude": latitude, "longitude": longitude, "altitude_m": altitude, "velocity_ms": velocity, "track_deg": track, "vertical_rate_ms": 0, "observed_at": now})
            aircraft.positions.all().delete()
            # Six hours of two-minute observations: dense enough to illustrate a real track.
            point_count = 181
            for point in range(point_count):
                progress = point / (point_count - 1)
                phase = progress * pi
                AircraftPosition.objects.create(
                    aircraft=aircraft,
                    latitude=latitude - .55 + progress * 1.1 + sin(phase) * .07,
                    longitude=longitude - .85 + progress * 1.7,
                    altitude_m=altitude + sin(phase) * 500,
                    track_deg=(track + sin(phase) * 18) % 360,
                    velocity_ms=velocity + sin(phase) * 12,
                    observed_at=now - timedelta(minutes=(point_count - 1 - point) * 2),
                )
        self.stdout.write(self.style.SUCCESS("Demo data loaded: 5 aircraft, 4 airports, 905 track points."))
