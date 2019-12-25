import Vue from 'vue';
import App from './App.vue';
import store from './store';
import Editor from './script/Editor';
import { Log, LogError } from '@/script/modules/Logger';
import vgl from 'vue-golden-layout';
import '@/script/hacks/HTMLDivElement';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
const locale = require('element-ui/lib/locale/lang/en');

let debugMode: boolean = false;
// var vext = new VEXTInterface();
if ((window).location.protocol.indexOf('webui') === -1) {
	if (window.location.ancestorOrigins === undefined || window.location.ancestorOrigins[0] !== 'webui://main') {
		debugMode = true;
	}
}

window.debug = debugMode;
(window).editor = new Editor(debugMode);
(window).Log = Log;
(window).LogError = LogError;

Vue.use(vgl);
Vue.use(ElementUI, { locale });

new Vue({
	render: (h) => h(App),
	store
}).$mount('#app');
