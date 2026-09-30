"""Archive a single OpenSky track locally as database points and GeoJSON."""
import json
from datetime import datetime, timezone as datetime_timezone
from pathlib import Path
from urllib.parse import urlencode

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from flight_api.models import AircraftCurrent, AircraftPosition
from .collect_opensky import API_URL, fetch_json, get_access_token


class Command(BaseCommand):
    help = "Download one current OpenSky track and archive it under data/routes/ as GeoJSON."

    def add_arguments(self, parser):
        parser.add_argument("icao24", help="Six-character hexadecimal transponder address, for example 3c4b26")

    def handle(self, *args, **options):
        icao24 = options["icao24"].strip().lower()
        if len(icao24) != 6 or any(character not in "0123456789abcdef" for character in icao24):
            raise CommandError("icao24 must be a six-character hexadecimal address")
        headers = {}
        token = get_access_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            payload = fetch_json(f"{API_URL.replace('/states/all', '/tracks/all')}?{urlencode({'icao24': icao24, 'time': 0})}", headers=headers)
        except Exception as error:
            raise CommandError(f"OpenSky track request failed: {error}") from error

        path = [point for point in payload.get("path") or [] if len(point) >= 3 and point[1] is not None and point[2] is not None]
        if not path:
            raise CommandError("OpenSky returned no valid path points for this aircraft")
        latest = path[-1]
        latest_time = datetime.fromtimestamp(latest[0], tz=datetime_timezone.utc)
        aircraft, _ = AircraftCurrent.objects.update_or_create(
            icao24=icao24,
            defaults={"callsign": (payload.get("callsign") or "").strip(), "origin_country": "", "latitude": latest[1], "longitude": latest[2], "altitude_m": latest[3] if len(latest) > 3 else None, "track_deg": latest[4] if len(latest) > 4 else None, "velocity_ms": None, "vertical_rate_ms": None, "observed_at": latest_time or timezone.now()},
        )
        features = []
        for point in path:
            observed_at = datetime.fromtimestamp(point[0], tz=datetime_timezone.utc)
            altitude = point[3] if len(point) > 3 else None
            track = point[4] if len(point) > 4 else None
            AircraftPosition.objects.update_or_create(
                aircraft=aircraft, observed_at=observed_at,
                defaults={"latitude": point[1], "longitude": point[2], "altitude_m": altitude, "track_deg": track, "velocity_ms": None},
            )
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [point[2], point[1]]}, "properties": {"icao24": icao24, "observed_at": observed_at.isoformat(), "altitude_m": altitude, "track_deg": track}})

        target = Path(settings.BASE_DIR) / "data" / "routes" / f"{icao24}.geojson"
        target.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=2), encoding="utf-8")
        mode = "OAuth" if token else "anonymous"
        self.stdout.write(self.style.SUCCESS(f"Archived {len(features)} points to {target} ({mode} mode)."))
