from rest_framework import generics
from .models import plane_now
from .serializers import PlaneNowGeoJSONSerializer

from django.db.models import Q
from django.db import connection
from .models import PlaneTrack
from .serializers import PlaneTrackSerializer

from rest_framework import viewsets
from .models import airport
from .serializers import AirPortsSerializer

from .models import ASP
from .serializers import ASPSerializer

class PlaneNowGeoJSONList(generics.ListAPIView):
    queryset = plane_now.objects.all()
    serializer_class = PlaneNowGeoJSONSerializer

class PlaneTrackList(generics.ListAPIView):
    serializer_class = PlaneTrackSerializer

    def get_queryset(self):
        icao24 = self.request.query_params.get('icao24')
        if icao24 is None:
            raise ValueError("icao24 参数必须提供")

        # 动态构建表名
        table_name =  table_name = f"{icao24}"

        # 使用 raw SQL 查询
        with connection.cursor() as cursor:
            query = f"SELECT * FROM \"{table_name}\""
            print(f"Executing SQL: {query}")  # 打印 SQL 查询
            cursor.execute(query)
            rows = cursor.fetchall()

        # 将查询结果转换为 PlaneTrack 模型的实例
        tracks = []
        for row in rows:
            track = PlaneTrack(
                id=row[0],
                callsign=row[1],
                origin_country=row[2],
                time_position=row[3],
                last_contact=row[4],
                longitude=row[5],
                latitude=row[6],
                baro_altitude=row[7],
                on_ground=row[8],
                velocity=row[9],
                true_track=row[10],
                vertical_rate=row[11],
                sensors=row[12],
                geo_altitude=row[13],
                squawk=row[14],
                spi=row[15],
                position_source=row[16],
                geom=row[17]
            )
            tracks.append(track)

        return tracks



class AirPortsList(generics.ListAPIView):
    queryset = airport.objects.all()
    serializer_class = AirPortsSerializer

class ASPGeoJSONList(generics.ListAPIView):
    queryset = ASP.objects.all()
    serializer_class = ASPSerializer