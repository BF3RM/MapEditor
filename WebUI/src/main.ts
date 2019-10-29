import Vue from 'vue';
import App from './App.vue';
import store from './store';

import Editor from './script/Editor';

import './style/style.css';
import { Log, LogError } from '@/script/modules/Logger';

let debugMode: boolean = false;
// var vext = new VEXTInterface();
if ((window as Window).location.href.indexOf('webui') === -1) {
    debugMode = true;
}
(window as Window).editor = new Editor(debugMode);
(window as Window).log = Log;
(window as Window).logError = LogError;

new Vue({
    render: h => h(App),
    store,
}).$mount('#app');