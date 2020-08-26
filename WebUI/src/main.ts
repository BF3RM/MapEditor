import Vue from 'vue';
import App from './App.vue';
import store from './store';
import vgl from 'vue-golden-layout';
import '@/script/hacks/HTMLDivElement';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import { Log, LogError } from '@/script/modules/Logger';
import VEXTInterface from '@/script/modules/VEXT';
import Editor from '@/script/Editor';
const locale = require('element-ui/lib/locale/lang/en');

let debugMode: boolean = false;
if (!navigator.userAgent.includes('VeniceUnleashed')) {
	if (window.location.ancestorOrigins === undefined || window.location.ancestorOrigins[0] !== 'webui://main') {
		debugMode = true;
	}
}
window.debug = debugMode;
(window).editor = new Editor(debugMode);
window.vext = new VEXTInterface(debugMode);

(window).Log = Log;
(window).LogError = LogError;

Vue.use(vgl);
Vue.use(ElementUI, { locale });
new Vue({
	render: (h) => h(App),
	store
}).$mount('#app');
