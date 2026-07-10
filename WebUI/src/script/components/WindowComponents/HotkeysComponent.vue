<template>
	<WindowComponent :visible="state.visible" :title="title" :isDestructible="true" class="hotkey-window" @update:visible="Close">
		<div class="container hotkeys-container scrollable">
			<div>
				<h6>Global</h6>
				<div class="hotkey-grid">
					<div class="hotkey-col" v-for="(col, ci) in [leftCol(hotkeysDown), rightCol(hotkeysDown)]" :key="ci">
						<key-tip
							v-for="(hotkey, index) in col"
							:key="index"
							:keys="keyCodeToChar[hotkey.key]"
							:description="hotkey.description"
							:needsCtrl="hotkey.needsCtrl"
							:needsShift="hotkey.needsShift"
						/>
					</div>
				</div>
				<h6>Viewport</h6>
				<div class="hotkey-grid">
					<div class="hotkey-col" v-for="(col, ci) in [leftCol(hotkeysCanvas), rightCol(hotkeysCanvas)]" :key="ci">
						<key-tip
							v-for="(hotkey, index) in col"
							:key="index"
							:keys="keyCodeToChar[hotkey.key]"
							:description="hotkey.description"
							:needsCtrl="hotkey.needsCtrl"
							:needsShift="hotkey.needsShift"
						/>
					</div>
				</div>
				<h6>Camera &amp; Mouse</h6>
				<div class="hotkey-grid">
					<div class="hotkey-col" v-for="(col, ci) in [leftCol(mouseHotkeys), rightCol(mouseHotkeys)]" :key="'m' + ci">
						<key-tip
							v-for="(hotkey, index) in col"
							:key="index"
							:keys="hotkey.keys"
							:description="hotkey.description"
							:needsCtrl="hotkey.needsCtrl"
							:needsShift="hotkey.needsShift"
							:needsAlt="hotkey.needsAlt"
						/>
					</div>
				</div>
				<h6>Freecam</h6>
				<div class="hotkey-grid">
					<div class="hotkey-col" v-for="(col, ci) in [leftCol(hotkeysFreecam), rightCol(hotkeysFreecam)]" :key="ci">
						<key-tip
							v-for="(hotkey, index) in col"
							:key="index"
							:keys="keyCodeToChar[hotkey.key]"
							:description="hotkey.description"
							:needsCtrl="hotkey.needsCtrl"
							:needsShift="hotkey.needsShift"
						/>
					</div>
				</div>
			</div>
		</div>
		<div class="footer">
			<button @click="Close" class="btn btn-lg btn-dark">Close</button>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import WindowComponent from './WindowComponent.vue';
import KeyTip from '../KeyTip.vue';
import { HOTKEYS } from '../../modules/HotkeyConfig';
import { HOTKEY_TYPE, keyCodeToChar } from '../../modules/Hotkey';
import { signals } from '@/script/modules/Signals';

export default defineComponent({
    name: 'HotkeysComponent',
    components: {
        WindowComponent,
        KeyTip
    },
    data() {
        return {
            title: 'Hotkeys',
            hotkeysDown: HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.Down || key.type === HOTKEY_TYPE.Lua),
            hotkeysCanvas: HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.CanvasOnlyDown),
            hotkeysFreecam: HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.Freecam),
            // Mouse / camera interactions added in the Gameface port. These aren't keycode
            // hotkeys (they're mouse-button combos handled in THREEManager), so they're listed
            // here statically rather than pulled from HOTKEYS.
            mouseHotkeys: [
                { keys: 'LMB', needsAlt: true, description: 'Orbit the camera around the selected object.' },
                { keys: 'RMB', needsAlt: true, description: 'Zoom the camera toward / away from the selection.' },
                { keys: 'LMB', needsCtrl: true, description: 'Add / remove an object from the selection.' },
                { keys: 'LMB', description: 'Select an object, or drag a gizmo axis to move it.' },
                { keys: 'RMB', description: 'Hold to fly the free camera (with WASD).' },
                { keys: 'LMB', description: 'Double-click an item in Scene Instances to focus on it.' }
            ],
            keyCodeToChar: keyCodeToChar,
            state: {
                visible: false
            }
        };
    },
    mounted() {
        signals.menuRegistered.emit(['File', 'Hotkeys'], () => {
            this.title = 'Hotkeys';
            this.state.visible = true;
        });
    },
    methods: {
        Close() {
            this.state.visible = false;
        },
        // Gameface port: CSS grid / flex-wrap don't work, so split a list into two flex
        // columns manually (even indices left, odd indices right) to get the 2-col layout.
        leftCol(list: any[]) {
            return list.filter((_: any, i: number) => i % 2 === 0);
        },
        rightCol(list: any[]) {
            return list.filter((_: any, i: number) => i % 2 === 1);
        }
    }
});
</script>
<style lang="scss" scoped>
.hotkeys-container {
	margin-bottom: 0 !important;
	position: relative;
	padding: 1.5vh;
	/* Gameface port: allow the list to scroll (it's taller than the window). */
	min-height: 0;
	overflow-y: auto;

	h6 {
		color: #fff;
		font-size: 14px;
		margin-bottom: 16px;
		text-transform: uppercase;
		font-weight: 600;
		margin-top: 28px;

		&:first-of-type {
			margin-top: 0;
		}
	}

	/* Gameface port: CSS Grid AND flex-wrap don't work in Cohtml -> two flex columns
	   (items split even/odd) instead of a 2-col grid. */
	.hotkey-grid {
		display: flex;
		flex-direction: row;
		gap: 14px;
		margin-bottom: 6px;

		.hotkey-col {
			flex: 1 1 0;
			min-width: 0;
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
	}
}

.hotkey-window {
	.footer {
		position: absolute;
		bottom: 1.5vh;
		right: 1.5vh;
	}

	::v-deep .window {
		.content {
			padding: 0;
		}
	}
}
</style>
