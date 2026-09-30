import 'leaflet/dist/leaflet.css';
import '../scripts/leaflet_openweathermap.css'
import {L} from '../scripts/leaflet_openweathermap.js'

// Provide VITE_OPENWEATHER_API_KEY in a local .env file. Never commit its value.
var OWM_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

export function GetWeatherLayer(weather) {
    
    var clouds = L.OWM.clouds({ opacity: 0.8, legendImagePath: 'NT2.png', appId: OWM_API_KEY });
    var cloudscls = L.OWM.cloudsClassic({ opacity: 0.5, appId: OWM_API_KEY });
    var precipitation = L.OWM.precipitation({ opacity: 0.5, appId: OWM_API_KEY });
    var precipitationcls = L.OWM.precipitationClassic({ opacity: 0.5, appId: OWM_API_KEY });
    var rain = L.OWM.rain({ opacity: 0.5, appId: OWM_API_KEY });
    var raincls = L.OWM.rainClassic({ opacity: 0.5, appId: OWM_API_KEY });
    var snow = L.OWM.snow({ opacity: 0.5, appId: OWM_API_KEY });
    var pressure = L.OWM.pressure({ opacity: 0.4, appId: OWM_API_KEY });
    var pressurecntr = L.OWM.pressureContour({ opacity: 0.5, appId: OWM_API_KEY });
    var temp = L.OWM.temperature({ opacity: 0.5, appId: OWM_API_KEY });
    var wind = L.OWM.wind({ opacity: 0.5, appId: OWM_API_KEY });

    switch (weather) {
        case 'clouds':
            return clouds;
        case 'cloudscls':
            return cloudscls;
        case 'precipitation':
            return precipitation;
        case 'precipitationcls':
            return precipitationcls;
        case 'rain':
            return rain;
        case 'raincls':
            return raincls;
        case 'snow':
            return snow;
        case 'pressure':
            return pressure;
        case 'pressurecntr':
            return pressurecntr;
        case 'temp':
            return temp;
        case 'wind':
            return wind;
        default:
            //throw new Error('Invalid weather type specified.');
            return null;
    }
}



