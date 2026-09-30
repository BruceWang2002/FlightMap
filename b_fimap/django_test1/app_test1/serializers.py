from rest_framework import serializers
from .models import plane_now
from .models import PlaneTrack
from .models import airport

from .models import ASP

class PlaneNowGeoJSONSerializer(serializers.ModelSerializer):
    # 定义额外的只读字段，用于 GeoJSON 输出
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = plane_now
        fields = ('icao24', 'callsign', 'origin_country','time_position','longitude','latitude', 'baro_altitude','velocity','true_track','vertical_rate','geom', 'geometry')  # 确保包含 geometry 字段

    def get_geometry(self, obj):
        # 如果 geometry 字段存在且非空，则返回 GeoJSON 格式的 geometry
        if obj.geom:
            return {
                "type": obj.geom.geom_type,
                "coordinates": obj.geom.coords
            }
        return None

    def to_representation(self, instance):
        # 从模型实例中获取字段值
        data = super().to_representation(instance)

        # 移除不需要的字段
        data.pop('geometry', None)  # 移除 geom 字段

        # 构建 GeoJSON 特征对象
        feature = {
            "type": "Feature",
            "geometry": data.pop('geom', None),  # 移除 geometry 并将其添加到 GeoJSON 中
            "properties": data  # 剩余的数据作为 properties
        }

        return feature

class PlaneTrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlaneTrack
        fields =('callsign','true_track','velocity','time_position','baro_altitude','geom')  # 包括模型中的所有字段

    def get_geometry(self, obj):
        # 如果 geometry 字段存在且非空，则返回 GeoJSON 格式的 geometry
        if obj.geom:
            return {
                "type": obj.geom.geom_type,
                "coordinates": obj.geom.coords
            }
        return None

    def to_representation(self, instance):
        # 从模型实例中获取字段值
        data = super().to_representation(instance)

        # 构建 GeoJSON 特征对象
        feature = {
            "type": "Feature",
            "geometry": data.pop('geom', None),  # 移除 geometry 并将其添加到 GeoJSON 中
            "properties": data  # 剩余的数据作为 properties
        }

        return feature

class AirPortsSerializer(serializers.ModelSerializer):
    # 定义额外的只读字段，用于 GeoJSON 输出
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = airport
        fields = ('name', 'type', 'ident', 'iso_region', 'iso_country','municipality', 'geometry')  # 确保包含 geometry 字段

    def get_geometry(self, obj):
        # 如果 geometry 字段存在且非空，则返回 GeoJSON 格式的 geometry
        if obj.geometry:
            return {
                "type": obj.geometry.geom_type,
                "coordinates": obj.geometry.coords
            }
        return None

    def to_representation(self, instance):
        # 从模型实例中获取字段值
        data = super().to_representation(instance)

        # 构建 GeoJSON 特征对象
        feature = {
            "type": "Feature",
            "geometry": data.pop('geometry', None),  # 移除 geometry 并将其添加到 GeoJSON 中
            "properties": data  # 剩余的数据作为 properties
        }

        return feature


class ASPSerializer(serializers.ModelSerializer):
    # 定义额外的只读字段，用于 GeoJSON 输出
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = ASP
        fields = ('id', 'name', 'updatedAt', 'type', 'icaoClass', 'activity', 'country', 'upperLimit', 'lowerLimit', 'geometry')  # 确保包含 geometry 字段

    def get_geometry(self, obj):
        # 如果 geometry 字段存在且非空，则返回 GeoJSON 格式的 geometry
        if obj.geometry:
            return {
                "type": obj.geometry.geom_type,
                "coordinates": obj.geometry.coords
            }
        return None

    def to_representation(self, instance):
        # 从模型实例中获取字段值
        data = super().to_representation(instance)

        # 构建 GeoJSON 特征对象
        feature = {
            "type": "Feature",

            "properties": data,  # 剩余的数据作为 properties
            "geometry": data.pop('geometry', None),  # 移除 geom 并将其添加到 GeoJSON 中
        }

        return feature

