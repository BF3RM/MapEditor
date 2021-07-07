import Vue from 'vue';
import App from './App.vue';
import store from './store';
import vgl from 'vue-golden-layout';
import '@/script/hacks/HTMLDivElement';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import './style/types.scss';
import { Log, LogError } from '@/script/modules/Logger';
import VEXTInterface from '@/script/modules/VEXT';
import Editor from '@/script/Editor';
import TypeDocumentationLink from '@/script/components/EditorComponents/Inspector/EBXComponents/TypeDocumentationLink.vue';
import Property from '@/script/components/EditorComponents/Inspector/EBXComponents/Property.vue';
import Reference from '@/script/components/EditorComponents/Inspector/EBXComponents/ReferenceProperty.vue';
import Partition from '@/script/components/EditorComponents/Inspector/EBXComponents/Partition.vue';
import Instance from '@/script/components/EditorComponents/Inspector/EBXComponents/InstanceProperty.vue';
import { capitalize, removeExtension } from './filters';
import VueCompositionAPI from '@vue/composition-api';

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
Vue.use(VueCompositionAPI);

Vue.use(ElementUI, { locale });

Vue.component('TypeDocumentationLink', TypeDocumentationLink);
Vue.component('Property', Property);
Vue.component('Reference', Reference);
Vue.component('Partition', Partition);
Vue.component('Instance', Instance);

Vue.filter('capitalize', capitalize);
Vue.filter('removeExt', removeExtension);

new Vue({
	render: (h) => h(App),
	store
}).$mount('#app');
