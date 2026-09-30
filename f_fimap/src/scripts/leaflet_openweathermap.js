/**
 * A JavaScript library for using OpenWeatherMap's layers and OWM's city data for leaflet based maps without hassle.
 * License: CC0 (Creative Commons Zero), see https://creativecommons.org/publicdomain/zero/1.0/
 * Project page: https://github.com/buche/leaflet-openweathermap/
 */
import L from 'leaflet';

L.OWM = L.TileLayer.extend({
	options: {
		appId: 'GET_YOUR_OWN_APPID', /* pass your own AppId as parameter when creating the layer. Get your own AppId at https://www.openweathermap.org/appid */
		baseUrl: "https://{s}.tile.openweathermap.org/map/{layername}/{z}/{x}/{y}.png",
		maxZoom: 18,
		showLegend: true,
		legendImagePath: null,
		legendPosition: 'bottomleft',
		attribution: 'Weather from <a href="https://openweathermap.org/" alt="World Map and worldwide Weather Forecast online">OpenWeatherMap</a>'
	},

	initialize: function (options) {
		L.Util.setOptions(this, options);
		var tileurl = this.options.baseUrl.replace('{layername}', this._owmLayerName);
		tileurl = tileurl + '?appid=' + this.options.appId;

		this._map = null;
		this._legendControl = null;
		this._legendId = null;
		this._owmtileurl = tileurl;
		L.TileLayer.prototype.initialize.call(this, this._owmtileurl, options);
	},

	onAdd: function(map) {
		this._map = map;
		if (this.options.showLegend && this.options.legendImagePath != null) {
			this._legendControl = this._getLegendControl();
			this._legendId = this._legendControl.addLegend(this.options.legendImagePath);
		}
		L.TileLayer.prototype.onAdd.call(this, map);
	},

	onRemove: function(map) {
		if (this._legendControl != null) {
			this._legendControl.removeLegend(this._legendId);
			this._legendControl = null;
			this._legendId = null;
		}
		L.TileLayer.prototype.onRemove.call(this, map);
		this._map = null;
	},

	_getLegendControl: function() {
		if (typeof this._map._owm_legendcontrol == 'undefined' || !this._map._owm_legendcontrol) {
			this._map._owm_legendcontrol = new L.OWM.LegendControl({position: this.options.legendPosition});
			this._map.addControl(this._map._owm_legendcontrol);
		}
		return this._map._owm_legendcontrol;
	}
});

(function () {

	L.OWM.Precipitation = L.OWM.extend({
		_owmLayerName: 'precipitation'
	});
	L.OWM.precipitation = function (options) { return new L.OWM.Precipitation(options); };

	L.OWM.PrecipitationClassic = L.OWM.extend({
		_owmLayerName: 'precipitation_cls'
	});
	L.OWM.precipitationClassic = function (options) {
		var layer = new L.OWM.PrecipitationClassic(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/PR.png';
		}
		return layer;
	};

	L.OWM.Rain = L.OWM.extend({
		_owmLayerName: 'rain'
	});
	L.OWM.rain = function (options) { return new L.OWM.Rain(options); };

	L.OWM.RainClassic = L.OWM.extend({
		_owmLayerName: 'rain_cls'
	});
	L.OWM.rainClassic = function (options) {
		var layer = new L.OWM.RainClassic(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/RN.png';
		}
		return layer;
	};

	L.OWM.Snow = L.OWM.extend({
		_owmLayerName: 'snow'
	});
	L.OWM.snow = function (options) {
		var layer = new L.OWM.Snow(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/SN.png';
		}
		return layer;
	};

	L.OWM.Clouds = L.OWM.extend({
		_owmLayerName: 'clouds'
	});
	L.OWM.clouds = function (options) { return new L.OWM.Clouds(options); };

	L.OWM.CloudsClassic = L.OWM.extend({
		_owmLayerName: 'clouds_cls'
	});
	L.OWM.cloudsClassic = function (options) {
		var layer = new L.OWM.CloudsClassic(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/NT.png';
		}
		return layer;
	};

	L.OWM.Pressure = L.OWM.extend({
		_owmLayerName: 'pressure'
	});
	L.OWM.pressure = function (options) {
		var layer = new L.OWM.Pressure(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/PN.png';
		}
		return layer;
	};

	L.OWM.PressureContour = L.OWM.extend({
		_owmLayerName: 'pressure_cntr'
	});
	L.OWM.pressureContour = function (options) { return new L.OWM.PressureContour(options); };

	L.OWM.Temperature = L.OWM.extend({
		_owmLayerName: 'temp'
	});
	L.OWM.temperature = function (options) {
		var layer = new L.OWM.Temperature(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/TT.png';
		}
		return layer;
	};

	L.OWM.Wind = L.OWM.extend({
		_owmLayerName: 'wind'
	});
	L.OWM.wind = function (options) {
		var layer = new L.OWM.Wind(options);
		if (layer.options.legendImagePath == null) {
			layer.options.legendImagePath = 'https://openweathermap.org/img/a/UV.png';
		}
		return layer;
	};

}());

L.OWM.LegendControl = L.Control.extend({
	options: {
		position: "bottomleft"
	},

	initialize: function(options) {
		L.Util.setOptions(this, options);
		this._container = L.DomUtil.create('div', 'owm-legend-container');
		this._container.style.display = 'none';
		this._legendCounter = 0;
		this._legendContainer = new Array();
	},

	onAdd: function(map) {
		return this._container;
	},

	addLegend: function(legendImagePath) {
		var legendId = this._legendCounter++;
		this._legendContainer[legendId] = legendImagePath;
		this._redrawLegend();
		this._container.style.display = 'block';
		return legendId;
	},

	removeLegend: function(legendId) {
		if (typeof this._legendContainer[legendId] != 'undefined') {
			delete this._legendContainer[legendId];
		}
		// reset counter if no legend is in collection
		var containerEmpty = true;
		for (var idx in this._legendContainer) {
			containerEmpty = false;
			break;
		}
		if (containerEmpty) {
			this._legendCounter = 0;
			this._container.style.display = 'none';
		}
		this._redrawLegend();
	},

	_redrawLegend: function() {
		this._container.innerHTML = ''; // clear container
		var isLeft = this.options.position.indexOf('left') !== -1;
		var cssFloat = isLeft ? 'left' : 'right';
		for (var idx in this._legendContainer) {
			if (isNaN(idx)) {
				continue;
			}
			var imgPath = this._legendContainer[idx];
			var item = L.DomUtil.create('div', 'owm-legend-item', this._container);
			item.style.cssFloat = cssFloat;
			if (isLeft) {
				item.style.marginRight = '10px';
			} else {
				item.style.marginLeft = '10px';
			}
			item.innerHTML = '<img src="' + imgPath + '" border="0" />';
		}
	}
});

export { L };
