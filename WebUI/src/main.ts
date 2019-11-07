import Vue from 'vue';
import App from './App.vue';
import store from './store';
import Editor from './script/Editor';

import './style/style.scss';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';

import { Log, LogError } from '@/script/modules/Logger';
import vgl from 'vue-golden-layout';
import '@/script/hacks/HTMLDivElement';

let debugMode: boolean = false;
// var vext = new VEXTInterface();
if ((window).location.href.indexOf('webui') === -1) {
	debugMode = true;
}
(window).editor = new Editor(debugMode);
(window).log = Log;
(window).logError = LogError;

Vue.use(vgl);

new Vue({
	render: (h) => h(App),
	store
}).$mount('#app');
