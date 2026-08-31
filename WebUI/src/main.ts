import Vue from 'vue';
import App from './App.vue';
import store from './store';
import vgl from 'vue-golden-layout';
// import VTooltip from 'v-tooltip'; // disabled in Gameface (throws) — see Vue.directive below
import '@/script/hacks/HTMLDivElement';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import './style/types.scss';
import { Log, LogError } from '@/script/modules/Logger';
import VEXTInterface from '@/script/modules/VEXT';
import Editor from '@/script/Editor';
import { VEXTemulator } from '@/script/modules/VEXTemulator';
import TypeDocumentationLink from '@/script/components/EditorComponents/Inspector/EBXComponents/TypeDocumentationLink.vue';
import Property from '@/script/components/EditorComponents/Inspector/EBXComponents/Property.vue';
import Reference from '@/script/components/EditorComponents/Inspector/EBXComponents/ReferenceProperty.vue';
import Partition from '@/script/components/EditorComponents/Inspector/EBXComponents/Partition.vue';
import Instance from '@/script/components/EditorComponents/Inspector/EBXComponents/InstanceProperty.vue';
import { capitalize, removeExtension } from './filters';

const locale = require('element-ui/lib/locale/lang/en');

// Detect whether we run inside the engine (Gameface/Chromium) vs a dev browser.
// The old check keyed on `navigator.userAgent` containing 'VeniceUnleashed',
// but Gameface reports a different UA, which wrongly forced debug mode. The
// injected `WebUI` global only exists in-engine, so key on that instead.
const inEngine = typeof (window as any).WebUI !== 'undefined';
const debugMode: boolean = !inEngine;

// Gameface port: console.* is EXPENSIVE in-engine — each call is serialized and
// buffered by the engine logger. The codebase logs on hot paths (every command,
// message, mouse pick, render). Under fast interaction this steady I/O + string
// allocation surfaces as periodic multi-second stalls (the log buffer flushes / GC
// runs, the thread freezes ~1-2s, then recovers). Silence the high-volume levels
// in-engine; keep error/warn (low volume, genuinely useful). The in-game Logs panel
// is fed by window.Log / signals.onLog, NOT console.*, so nothing is lost there.
if (inEngine) {
	const __noop = () => undefined;
	// eslint-disable-next-line no-console
	console.log = __noop;
	// eslint-disable-next-line no-console
	console.info = __noop;
	// eslint-disable-next-line no-console
	console.debug = __noop;
}

window.debug = debugMode;
window.editor = new Editor(debugMode);
// Standalone: swap levels without a rebuild, e.g. loadLevel('Levels/MP_007/MP_007').
if (debugMode) {
	(window as any).loadLevel = (path?: string, game?: string) => VEXTemulator.LoadWebXLevel(path, game);
}
window.vext = new VEXTInterface(debugMode);

window.Log = Log;
window.LogError = LogError;

// Gameface port: the freecam "fly" trigger (hold RIGHT mouse) used to be detected
// by the three.js viewport canvas, which is stubbed out now. Detect it here in JS
// instead: on right-mouse DOWN the WebUI still owns the mouse, so tell Lua to hand
// input to the game (EnableFreeCamMovement). The matching right-mouse UP is caught
// on the Lua side (the game owns the mouse by then).
document.addEventListener('mousedown', (e: MouseEvent) => {
	// Ctrl+RMB (axis drag) and Alt+RMB (dolly zoom) are handled in THREEManager, not
	// freecam.
	if (e.button === 2 && !e.ctrlKey && !e.altKey && (window as any).vext) {
		(window as any).vext.SendEvent('EnableFreeCamMovement');
	}
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Gameface port: Vue component errors are EXPENSIVE to surface in-engine. With no custom
// handler, Vue logs every caught error to console.error (which is NOT neutered), and the
// WebUI mounts + re-renders continuously from the moment the mod loads (independent of
// editor mode). A component that throws on a per-frame re-render then floods the engine
// logger and freezes the game for seconds at a time. Swallow them in-engine (nothing is
// lost: the in-game Logs panel is fed by window.Log, not console.*); log them in a dev
// browser for debugging.
Vue.config.errorHandler = (err, _vm, info) => {
	if (!inEngine) {
		// eslint-disable-next-line no-console
		console.error('[Vue] ' + info, err);
	}
};

Vue.use(vgl);
// Gameface port: the v-tooltip LIBRARY uses document.createRange() (missing in Gameface)
// and `instanceof` on undefined globals -> it THREW on every bind/unbind/hover, spamming
// exceptions and dropping clicks. Replace it with a tiny hand-rolled `v-tooltip` that
// shows a single floating <div> above the hovered element. position:fixed + appended to
// <body> so it's never clipped by a panel's overflow.
// Vue.use(VTooltip);
let __tipEl: HTMLElement | null = null;
function __getTip(): HTMLElement {
	if (!__tipEl) {
		__tipEl = document.createElement('div');
		__tipEl.style.cssText =
			'position:fixed;z-index:2147483647;pointer-events:none;background:#0b0e16;' +
			'color:#dfe4ea;font-size:12px;font-family:sans-serif;padding:4px 8px;border-radius:4px;' +
			'border:1px solid #05070b;white-space:nowrap;display:none;transform:translateX(-50%);' +
			'box-shadow:0 2px 8px rgba(0,0,0,0.5);';
		document.body.appendChild(__tipEl);
	}
	return __tipEl;
}
function __showTip(el: HTMLElement, text: string) {
	if (!text) return;
	const tip = __getTip();
	tip.textContent = text;
	tip.style.display = 'block';
	const r = el.getBoundingClientRect();
	tip.style.left = r.left + r.width / 2 + 'px';
	const th = tip.offsetHeight || 24;
	let top = r.top - th - 6;
	if (top < 2) top = r.bottom + 6; // flip below if there's no room above
	tip.style.top = top + 'px';
}
function __hideTip() {
	if (__tipEl) __tipEl.style.display = 'none';
}
Vue.directive('tooltip', {
	bind(el, binding) {
		const anyEl = el as any;
		anyEl.__tipText = binding.value;
		anyEl.__tipEnter = () => __showTip(el as HTMLElement, anyEl.__tipText);
		anyEl.__tipLeave = () => __hideTip();
		el.addEventListener('mouseenter', anyEl.__tipEnter);
		el.addEventListener('mouseleave', anyEl.__tipLeave);
		el.addEventListener('mousedown', anyEl.__tipLeave);
	},
	update(el, binding) {
		(el as any).__tipText = binding.value;
	},
	unbind(el) {
		const anyEl = el as any;
		if (anyEl.__tipEnter) el.removeEventListener('mouseenter', anyEl.__tipEnter);
		if (anyEl.__tipLeave) {
			el.removeEventListener('mouseleave', anyEl.__tipLeave);
			el.removeEventListener('mousedown', anyEl.__tipLeave);
		}
		__hideTip();
	}
});
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
