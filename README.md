# Flight Map MVP

一个可以直接在本机运行的飞行情报地图最小可行项目。前端使用 Vue 3、Leaflet 与 Cesium；后端使用 Django 和 SQLite。首次启动无需 PostGIS、GeoServer、外部航班账号或真实 API 密钥。

## 已实现

- 二维地图：四种无需 Key 的公开 OpenStreetMap 系底图、机场、天气叠加、航班点击轨迹、高度分色和速度缩放图标；含缩放、比例尺、鹰眼和测距控件。
- 三维地图：同一份航班状态数据的 Cesium 飞机模型视图，支持底图切换和航向旋转。
- 标准 GeoJSON API：航班、机场、单机轨迹和健康检查。
- 内置演示数据：可离线验证完整 UI/API 数据流。
- 可选天气图层：配置自己的 OpenWeatherMap key 后启用。

## 快速启动（Windows PowerShell）

打开两个终端。

后端：

```powershell
cd D:\Codex_Data\flight_map_design\b_fimap\django_test1
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py runserver
```

前端：

```powershell
cd D:\Codex_Data\flight_map_design\f_fimap
npm install
npm run dev
```

在浏览器打开 Vite 输出的地址（通常为 `http://localhost:5173`）。Vite 已将 `/api` 自动代理至 Django 的 `http://127.0.0.1:8000`。

## 可选天气配置

复制 `f_fimap/.env.example` 为 `f_fimap/.env`，填写自己的 OpenWeatherMap key：

```env
VITE_OPENWEATHER_API_KEY=your_key
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token
```

不要提交 `.env`。前端默认关闭天气图层，缺少 key 不影响其他功能。

三维地图的 Cesium World Terrain 与 Cesium OSM Buildings 需要一个免费的 Cesium ion access token。将它填入同一个 `.env` 的 `VITE_CESIUM_ION_TOKEN` 后重启前端；若没有 token，三维地图会安全回退为椭球地面和无建筑物模式。

在 Windows PowerShell 中也可直接执行：

```powershell
cd D:\Codex_Data\flight_map_design\f_fimap
Copy-Item .env.example .env
notepad .env
```

把 `your_key` 替换为 OpenWeatherMap 控制台创建的 API key（不要加引号），保存后停止并重新运行 `npm run dev`。浏览器刷新后，“天气叠加”下拉框即可启用。

## API

- `GET /api/v1/health/`
- `GET /api/v1/aircraft/?bbox=west,south,east,north&limit=500`
- `GET /api/v1/aircraft/{icao24}/track/?hours=6&limit=600`
- `GET /api/v1/airports/?bbox=west,south,east,north&limit=1000`

响应均使用 GeoJSON `FeatureCollection`。真实数据接入时，使用 `AircraftCurrent` 保存每架飞机的当前状态、`AircraftPosition` 保存轨迹点；不要恢复旧版“每架飞机一张表”的设计。

## 前端结构（便于学习）

```text
f_fimap/src/
├─ api/flightApi.js              # 唯一的后端请求入口
├─ composables/useFlightData.js  # 共享航班状态与定时刷新
├─ config/mapLayers.js           # 2D / 3D 共用的底图、天气、图例配置
└─ components/
   ├─ Home.vue                   # 页面状态和组件编排
   ├─ ResizableLayout.vue        # 可拖动宽度的侧栏布局
   ├─ Leaflet_Map.vue            # 二维地图渲染
   ├─ Cesium_Map.vue             # 三维飞机模型渲染
   └─ FlightLegend.vue           # 高度/速度视觉编码图例
```

地图组件只负责渲染和用户事件；请求、状态、底图配置被放在组件外。这使得以后接入 OpenSky、增加筛选器或替换地图服务时，不需要把逻辑复制到两个地图中。

## 重新生成演示轨迹

运行下面命令会重置并生成 5 架飞机、4 个机场和每架 181 个轨迹点（共 905 个点）：

```powershell
cd D:\Codex_Data\flight_map_design\b_fimap\django_test1
.\.venv\Scripts\python.exe manage.py seed_demo
```

## 拉取真实 OpenSky 航班

OpenSky 的状态接口支持以区域范围请求真实 ADS-B 状态。默认命令请求中欧范围，避免全局请求带来的额外额度消耗：

```powershell
cd D:\Codex_Data\flight_map_design\b_fimap\django_test1
.\.venv\Scripts\python.exe manage.py collect_opensky
```

匿名请求可用但额度更低；若需要稳定采集，请在后端进程环境中配置 `OPENSKY_CLIENT_ID` 与 `OPENSKY_CLIENT_SECRET`（OAuth 客户端凭据），再运行命令。每次运行都会更新当前状态；匿名调用应至少间隔 10 秒。

若希望在地图中看到连续的真实航迹，可在一次状态采集后额外归档前 20 架飞机的完整 OpenSky path。该选项会产生额外请求，因此只在需要更新本地航迹快照时使用：

```powershell
.\.venv\Scripts\python.exe manage.py collect_opensky --limit 100 --tracks 20
```

只有 OpenSky 返回至少 10 个有效坐标点的航迹会被标为可用；选择相应航班后，前端会直接从本地数据库绘制这些点。

OpenSky 不提供机场或空域数据库。当前 MVP 的机场为真实机场坐标演示数据；下一阶段可独立导入 OurAirports 机场数据和 OpenAIP/国家 AIP 空域数据，不能将它们错误地归为 OpenSky 数据。

可直接下载并导入欧洲范围真实机场到项目本地数据库：

```powershell
cd D:\Codex_Data\flight_map_design\b_fimap\django_test1
.\.venv\Scripts\python.exe manage.py import_ourairports --download
```

下载的 CSV 保存至 `data/imports/`，数据库只保存由 `--bbox` 和 `--limit` 筛选后的记录。空域数据需要单独从 OpenAIP 或相应国家 AIP 获取 GeoJSON；待获得明确的数据许可与文件后，应放进 `data/imports/` 再导入。

## 固定航线本地归档

对已知 ICAO24 地址下载一次航迹并保存在本项目中，避免后续重复调用远程接口：

```powershell
cd D:\Codex_Data\flight_map_design\b_fimap\django_test1
.\.venv\Scripts\python.exe manage.py collect_opensky_track 3c4b26
```

该命令会同步写入 `data/flight_map.sqlite3` 和 `data/routes/3c4b26.geojson`。`data/routes/` 中的 GeoJSON 是本地快照，供离线展示、分析和备份使用，不会被 Git 自动提交。

## 空间分析

目前空间分析在浏览器端对已加载的航班与机场执行 Haversine 大圆距离计算：在左侧勾选“在地图中打开空间分析工具”，选择飞机后即可在地图浮窗切换最近邻分析（3 个机场、1 架飞机）和半径范围查询；不产生 API 请求。二维地图右上角还有“测距/清除”工具，连续点击地图即可测量折线距离。

这种设计适合当前数百到数千个可见对象。将来接入全量机场、空域、航路或多用户空间查询时，应把 bbox、最近邻、相交和缓冲区分析迁移到后端 PostGIS，并把结果作为 GeoJSON 返回。

## 检查与构建

```powershell
cd D:\Codex_Data\flight_map_design\b_fimap\django_test1
.\.venv\Scripts\python.exe manage.py test

cd D:\Codex_Data\flight_map_design\f_fimap
npm run build
```

## 部署到 Render（免费演示环境）

仓库根目录的 `render.yaml` 已定义两个服务：Django 数据 API 与 Vue 静态站点。将整个 `flight_map_design` 文件夹作为一个 GitHub 仓库推送后，在 Render 选择 **New + → Blueprint** 并选中仓库即可读取此配置。

创建过程中，Render 会要求填写 `VITE_API_ROOT`。先让 API 服务完成首次部署，复制其公开地址，再填写：`https://你的-api-服务名.onrender.com/api/v1`。随后重新部署静态站点。天气功能仍需在 Render 的静态站点环境变量中配置 `VITE_OPENWEATHER_API_KEY`；它不会写入 Git 仓库。

免费实例会在空闲后休眠，首次唤醒可能需要几十秒。当前演示数据库是随代码部署的只读快照，免费实例重启或重新部署后，运行期采集的数据不会保证保留；正式持续采集应切换到 Render PostgreSQL/PostGIS。

## 历史原型

旧版 PostGIS/GeoDjango 代码仍保留在 `b_fimap/django_test1/app_test1` 和 `plane.py` 中，供参考，但已不参与 MVP 的安装、迁移或启动流程。历史凭据必须轮换后才能再接入任何第三方数据源。
