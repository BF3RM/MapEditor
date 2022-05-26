<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true" class="hotkey-window">
		<div class="container hotkeys-container">
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
			<h6>Canvas</h6>
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
	private title = 'Hotkeys';
	private hotkeysDown: any = [];
	private hotkeysCanvas: any = [];
	private keyCodeToChar: any;
	private state = {
		visible: false
	};

	mounted() {
		signals.menuRegistered.emit(['File', 'Hotkeys'], () => {
			this.title = 'Hotkeys';
			this.state.visible = true;
		});
		this.hotkeysDown = HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.Down);
		this.hotkeysCanvas = HOTKEYS.filter((key) => key.type === HOTKEY_TYPE.CanvasOnlyDown);
		this.keyCodeToChar = keyCodeToChar;
	}

	Close() {
		this.state.visible = false;
	}
}
</script>
<style lang="scss" scoped>
.hotkeys-container {
	h6 {
		color: #fff;
		font-size: 14px;
		margin-bottom: 16px;
		text-transform: uppercase;
		font-weight: 600;

		&:last-of-type {
			margin-top: 28px;
		}
	}

	.hotkey-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-gap: 14px;
	}
}

.hotkey-window {
	::v-deep .window {
		height: 75vh !important;
	}
}
</style>
