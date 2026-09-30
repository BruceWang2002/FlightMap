from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(name="AircraftCurrent", fields=[
            ("icao24", models.CharField(max_length=6, primary_key=True, serialize=False)), ("callsign", models.CharField(blank=True, max_length=16)), ("origin_country", models.CharField(blank=True, max_length=64)),
            ("latitude", models.FloatField()), ("longitude", models.FloatField()), ("altitude_m", models.FloatField(blank=True, null=True)), ("velocity_ms", models.FloatField(blank=True, null=True)), ("track_deg", models.FloatField(blank=True, null=True)), ("vertical_rate_ms", models.FloatField(blank=True, null=True)), ("observed_at", models.DateTimeField()), ("updated_at", models.DateTimeField(auto_now=True))], options={"ordering": ["callsign", "icao24"]}),
        migrations.CreateModel(name="Airport", fields=[
            ("ident", models.CharField(max_length=12, primary_key=True, serialize=False)), ("name", models.CharField(max_length=128)), ("airport_type", models.CharField(default="small_airport", max_length=32)), ("country", models.CharField(blank=True, max_length=2)), ("municipality", models.CharField(blank=True, max_length=64)), ("latitude", models.FloatField()), ("longitude", models.FloatField())], options={"ordering": ["name"]}),
        migrations.CreateModel(name="AircraftPosition", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("latitude", models.FloatField()), ("longitude", models.FloatField()), ("altitude_m", models.FloatField(blank=True, null=True)), ("track_deg", models.FloatField(blank=True, null=True)), ("velocity_ms", models.FloatField(blank=True, null=True)), ("observed_at", models.DateTimeField()),
            ("aircraft", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="positions", to="flight_api.aircraftcurrent"))], options={"ordering": ["observed_at"]}),
        migrations.AddIndex(model_name="aircraftposition", index=models.Index(fields=["aircraft", "observed_at"], name="flight_api_aircraf_7d0b29_idx")),
    ]
