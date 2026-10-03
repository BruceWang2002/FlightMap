import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

// Components own their styles; no unused global UI library resets popup geometry.
createApp(App).mount('#app')
