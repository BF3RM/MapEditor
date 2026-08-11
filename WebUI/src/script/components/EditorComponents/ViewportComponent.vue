<template>
	<EditorComponent id="viewport-component" title="Viewport">
		<!-- Overlay visibility menu (GH #395). Markers are drawn natively every frame by
		     NativeViewport; without an off switch a level full of them sits permanently between
		     you and the geometry you are placing them against. -->
		<template #header-actions>
			<span class="overlay-menu">
				<span class="overlay-button" :class="{ open: menuOpen, off: !settings.enabled }" @click="toggleMenu">
					Overlays<span class="caret">▾</span>
				</span>
				<span v-if="menuOpen" class="overlay-popover">
					<span class="row master" @click="toggle('enabled')">
						<span class="box" :class="{ checked: settings.enabled }"><span class="tick" /></span>
						<span class="label">Show overlays</span>
					</span>
					<span class="sep" />
					<span
						v-for="cat in categories"
						:key="cat.key"
						class="row"
						:class="{ muted: !settings.enabled }"
						@click="toggle(cat.key)"
					>
						<span class="box" :class="{ checked: settings[cat.key] }"><span class="tick" /></span>
						<span class="label">{{ cat.label }}</span>
					</span>
					<span class="sep" />
					<span class="row slider-row" :class="{ muted: !settings.enabled }">
						<span class="label">Draw distance</span>
						<span class="value">{{ settings.maxDistance === 0 ? 'unlimited' : settings.maxDistance + 'm' }}</span>
					</span>
					<input
						class="overlay-slider"
						type="range"
						min="0"
						max="500"
						step="10"
						:value="settings.maxDistance"
						@input="setDistance($event)"
					/>
				</span>
			</span>
		</template>
		<div id="stats" ref="stats" />
	</EditorComponent>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { signals } from '@/script/modules/Signals';

// Session-scoped, NOT durable: Gameface starts each client run with an empty localStorage
// (verified — the key is gone after a client relaunch, though it does survive a WebUI reload,
// which is the common case while editing). Durable settings would need ext-side storage.
const STORAGE_KEY = 'mapeditor.overlaySettings';

interface OverlaySettings {
	enabled: boolean;
	selection: boolean;
	highlight: boolean;
	placeholders: boolean;
	maxDistance: number;
}

const DEFAULTS: OverlaySettings = {
	enabled: true,
	selection: true,
	highlight: true,
	placeholders: true,
	maxDistance: 0
};

@Component({ components: { EditorComponent } })
export default class ViewportComponent extends EditorComponent {
	private menuOpen = false;
	private settings: OverlaySettings = { ...DEFAULTS };
	// Categories the ext can currently draw. #392 adds lights / spawn points / vehicle spawns /
	// triggers here; each new entry needs a matching flag in NativeViewport.m_Overlays.
	private readonly categories = [
		{ key: 'selection', label: 'Selection boxes' },
		{ key: 'highlight', label: 'Hover highlight' },
		{ key: 'placeholders', label: 'Placeholders' }
	];

	mounted() {
		signals.editor.Ready.connect(this.drawStats.bind(this));
		this.restore();
		// Push once on boot: the ext defaults to everything-on, so a restored "off" would
		// otherwise only take effect after the first manual toggle.
		signals.editor.Ready.connect(this.push.bind(this));
	}

	private restore() {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (raw) {
				this.settings = { ...DEFAULTS, ...JSON.parse(raw) };
			}
		} catch (e) {
			// Corrupt/unavailable storage must not take the viewport down with it.
			this.settings = { ...DEFAULTS };
		}
	}

	private persist() {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
		} catch (e) {
			/* not worth surfacing — the toggles simply won't survive a WebUI reload */
		}
	}

	private push() {
		window.vext.SendEvent('SetOverlaySettings', this.settings);
	}

	private toggleMenu() {
		this.menuOpen = !this.menuOpen;
	}

	private toggle(key: string) {
		(this.settings as any)[key] = !(this.settings as any)[key];
		// Vue 2 reactivity: replace the object so the template re-renders the checkbox.
		this.settings = { ...this.settings };
		this.persist();
		this.push();
	}

	private setDistance(event: any) {
		const value = parseInt(event.target.value, 10);
		this.settings = { ...this.settings, maxDistance: isNaN(value) ? 0 : value };
		this.persist();
		this.push();
	}

	drawStats() {
		const dom = window.editor.editorCore.stats.dom;
		if (dom !== null && this.$refs.stats !== undefined) {
			dom.setAttribute('style', 'position:absolute;opacity:0.5');
			(this.$refs.stats as any).appendChild(window.editor.editorCore.stats.dom);
		}
	}
}
</script>

<style lang="scss">
/* Gameface: no CSS Grid, no :not()/:last-child, no dashed borders, and native checkboxes do not
   toggle — so the checkbox is a clickable span, matching BoolControl. */
.overlay-menu {
	position: relative;
	display: inline-block;
}
.overlay-button {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 3px;
	background: rgba(255, 255, 255, 0.06);
	color: #8fa6c0;
	cursor: pointer;
	font-size: 11px;
}
.overlay-button.open {
	background: #037fff;
	color: #fff;
}
/* Reads as "overlays are currently suppressed" without opening the menu. */
.overlay-button.off {
	color: #d08b45;
}
.overlay-button .caret {
	margin-left: 5px;
	font-size: 9px;
}
.overlay-popover {
	position: absolute;
	top: 22px;
	right: 0;
	width: 190px;
	padding: 6px 0;
	background: rgba(22, 25, 36, 0.98);
	border: 1px solid rgba(5, 7, 11, 0.8);
	border-radius: 3px;
	z-index: 50;
	display: block;
}
.overlay-popover .row {
	display: flex;
	align-items: center;
	padding: 4px 10px;
	cursor: pointer;
	font-size: 11px;
	color: #8da1b6;
}
.overlay-popover .row.master {
	color: #b9cbe0;
	font-weight: 600;
}
/* Categories stay clickable while the master switch is off, so you can set up what you want
   before turning them back on — they just read as inactive. */
.overlay-popover .row.muted {
	opacity: 0.45;
}
.overlay-popover .row .label {
	flex: 1 1 auto;
}
.overlay-popover .row .value {
	flex: 0 0 auto;
	color: #6f8298;
}
.overlay-popover .slider-row {
	cursor: default;
}
.overlay-popover .box {
	position: relative;
	display: inline-block;
	width: 13px;
	height: 13px;
	margin-right: 8px;
	border-radius: 2px;
	background: #43506a;
	flex: 0 0 auto;
}
.overlay-popover .box.checked {
	background: #037fff;
}
.overlay-popover .box .tick {
	display: none;
}
.overlay-popover .box.checked .tick {
	display: block;
	position: absolute;
	left: 4px;
	top: 0;
	width: 4px;
	height: 8px;
	border: solid #fff;
	border-width: 0 2px 2px 0;
	transform: rotate(45deg);
}
.overlay-popover .sep {
	display: block;
	height: 1px;
	margin: 4px 0;
	background: rgba(255, 255, 255, 0.08);
}
.overlay-popover .overlay-slider {
	width: 170px;
	margin: 0 10px;
}
</style>
