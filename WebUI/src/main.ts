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

Vue.use(vgl);
Vue.use(ElementUI, { locale });

new Vue({
	render: (h) => h(App),
	store
}).$mount('#app');
