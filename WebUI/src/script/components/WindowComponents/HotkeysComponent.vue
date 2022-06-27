<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true" class="hotkey-window">
		<div class="container hotkeys-container scrollable">
			<div>
				<h6>Global</h6>
				<div class="hotkey-grid">
					<key-tip
						v-for="(hotkey, index) in hotkeysDown"
						:key="index"
						:keys="keyCodeToChar[hotkey.key]"
						:description="hotkey.description"
						:needsCtrl="hotkey.needsCtrl"
						:needsShift="hotkey.needsShift"
					/>
				</div>
				<h6>Viewport</h6>
				<div class="hotkey-grid">
					<key-tip
						v-for="(hotkey, index) in hotkeysCanvas"
						:key="index"
						:keys="keyCodeToChar[hotkey.key]"
						:description="hotkey.description"
						:needsCtrl="hotkey.needsCtrl"
						:needsShift="hotkey.needsShift"
					/>
				</div>
				<h6>Freecam</h6>
				<div class="hotkey-grid">
					<key-tip
						v-for="(hotkey, index) in hotkeysFreecam"
						:key="index"
						:keys="keyCodeToChar[hotkey.key]"
						:description="hotkey.description"
						:needsCtrl="hotkey.needsCtrl"
						:needsShift="hotkey.needsShift"
					/>
				</div>
			</div>
		</div>
		<div class="footer">
			<button @click="Close" class="btn btn-lg btn-dark">Close</button>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WindowComponent from './WindowComponent.vue';
import KeyTip from '../KeyTip.vue';
import { HOTKEYS } from '../../modules/HotkeyConfig';
import { HOTKEY_TYPE, keyCodeToChar } from '../../modules/Hotkey';
import { signals } from '@/script/modules/Signals';

@Component({ components: { WindowComponent, KeyTip } })
export default class HotkeysComponent extends Vue {
	title = 'Hotkeys';
	hotkeysDown: any = [];
	hotkeysCanvas: any = [];
	hotkeysFreecam: any = [];
	keyCodeToChar: any;
	state = {
		visible: false
	};

	mounted() {
		signals.menuRegistered.emit(['File', 'Hotkeys'], () => {
			this.title = 'Hotkeys';
			this.state.visible = true;
		});
		this.hotkeysDown = HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.Down || key.type === HOTKEY_TYPE.Lua);
		this.hotkeysCanvas = HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.CanvasOnlyDown);
		this.hotkeysFreecam = HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.Freecam);
		this.keyCodeToChar = keyCodeToChar;
	}

	Close() {
		this.state.visible = false;
	}
}
</script>
<style lang="scss" scoped>
.hotkeys-container {
	margin-bottom: 0 !important;

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

	.hotkey-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-gap: 14px;
	}
}

.hotkey-window {
	.footer {
		position: absolute;
		bottom: 1.5vh;
		right: 1.5vh;
	}

	::v-deep .window {
		height: 75vh !important;
	}
}
</style>
