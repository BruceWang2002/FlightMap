# 历史原型与当前 MVP 的边界

下列内容保留用于学习和回溯，不由当前 MVP 的启动流程加载：

- `app_test1/`：旧版 GeoDjango/DRF 原型，依赖 PostGIS 和历史迁移。
- `plane.py`：旧版采集实验脚本；请使用 `flight_api/management/commands/collect_opensky.py`。
- `import_geojson.py`：旧版绝对路径导入脚本，当前不可直接运行。
- `release-1930-.../`：历史 GDAL/MapServer Windows 二进制包；当前 SQLite MVP 不需要它。
- `f_fimap/src/components/*.html`、`scripts/leaflet_openweathermap.*`：历史说明页和图层实验代码，正式界面不引用。

这样保留文件是为了避免丢失大学项目的学习痕迹；新功能请写入 `flight_api/` 与 `f_fimap/src/` 的当前分层结构。
