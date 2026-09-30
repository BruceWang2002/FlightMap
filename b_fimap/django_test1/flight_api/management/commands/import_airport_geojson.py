"""Import airport point features from a local GeoJSON file into SQLite."""
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from flight_api.models import Airport


class Command(BaseCommand):
    help = "Import airport Point features from local GeoJSON. Use --replace to replace the current airport dataset."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(Path(settings.BASE_DIR) / "data" / "imports" / "eu_airports.geojson"))
        parser.add_argument("--replace", action="store_true", help="Delete existing airport records before importing")

    def handle(self, *args, **options):
        source = Path(options["file"])
        if not source.exists():
            raise CommandError(f"GeoJSON file does not exist: {source}")
        payload = json.loads(source.read_text(encoding="utf-8"))
        records = []
        for feature in payload.get("features", []):
            geometry = feature.get("geometry") or {}
            properties = feature.get("properties") or {}
            coordinates = geometry.get("coordinates") or []
            if geometry.get("type") != "Point" or len(coordinates) < 2:
                continue
            ident = str(properties.get("ident") or "").strip()
            if not ident:
                continue
            records.append(Airport(
                ident=ident,
                name=str(properties.get("name") or ident)[:128],
                airport_type=str(properties.get("type") or "unknown")[:32],
                country=str(properties.get("iso_country") or properties.get("country") or "")[:2],
                municipality=str(properties.get("municipality") or "")[:64],
                longitude=float(coordinates[0]),
                latitude=float(coordinates[1]),
                metadata={key: value for key, value in properties.items() if key not in {"ident", "name", "type", "iso_country", "country", "municipality"} and value is not None},
            ))
        if not records:
            raise CommandError("No valid airport Point features found")
        if options["replace"]:
            Airport.objects.all().delete()
        Airport.objects.bulk_create(
            records,
            batch_size=1000,
            update_conflicts=True,
            update_fields=["name", "airport_type", "country", "municipality", "longitude", "latitude", "metadata"],
            unique_fields=["ident"],
        )
        self.stdout.write(self.style.SUCCESS(f"Imported {len(records)} airports from {source}."))
