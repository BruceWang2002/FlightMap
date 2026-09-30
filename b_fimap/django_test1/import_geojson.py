import os
import django
from django.contrib.gis.gdal import DataSource
from app_test1.models import GeoFeature # 替换为你的应用名和模型名

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_test1.settings')
django.setup()

# 读取 GeoJSON 文件
geojson_path = r'D:\1Airmap\airports_CN.geojson'
ds = DataSource(geojson_path)

# 获取第一个图层
layer = ds[0]

# 导入数据到数据库
for feature in layer:
    geom = feature.geom.wkt  # 获取几何数据的WKT表示
    name = feature.get('name', 'Unnamed')  # 获取属性 'name'
    feature_type = feature.get('type', '')  # 获取属性 'type'
    iso_region = feature.get('iso_region', '')  # 获取属性 'iso_region'
    feature_id = feature.get('id', '')  # 获取属性 'id'
    GeoFeature.objects.create(name=name, feature_type=feature_type, iso_region=iso_region, feature_id=feature_id, geom=geom)

print("GeoJSON 数据导入完成")
