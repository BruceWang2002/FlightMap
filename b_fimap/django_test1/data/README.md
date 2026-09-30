# 本地数据目录

本目录存放运行时和可导入/导出的数据，不将数据散落到源码目录。

- `flight_map.sqlite3`：本地 SQLite 数据库（被 `.gitignore` 忽略）。
- `routes/`：从 OpenSky 保存的单机航迹 GeoJSON 快照。
- `imports/`：手工放入的机场、空域等原始数据文件。
- `exports/`：可分享的查询或分析导出结果。

数据模型由 `flight_api` 管理；不要手工编辑 SQLite 文件。定期复制整个 `data/` 目录即可备份本地数据。
