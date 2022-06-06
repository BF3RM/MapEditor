<template>
	<div id="page">
		<ActiveView/>
		<v-popover></v-popover>
	</div>
</template>
<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import '@/style/reset.scss';
import '@/style/style.scss';

import 'perfect-scrollbar/css/perfect-scrollbar.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import './style/icons.scss';

import Editor from '@/script/Editor';
import { Log, LogError } from '@/script/modules/Logger';
import ActiveView from '@/script/components/Views/ActiveView.vue';
import { EDITOR_MODE } from '@/script/types/Enums';
import VEXTInterface from '@/script/modules/VEXT';

@Component({
	components: {
		ActiveView
	}
})
export default class App extends Vue {
	mounted() {
		console.log('UI RELOADED');
		this.$nextTick(() => {
			window.vext.SendEvent('UIReloaded');
		});
	}

	@Prop()
	public title: string;

	get editor() {
		return window.editor;
	}

	public beforeDestroy() {
		console.log('Reloading UI');
		// Hack to force a complete UI reload when a component is destroyed because we did a hot-reload

		// eslint-disable-next-line no-self-assign
		window.location = window.location;
	}
}
</script>

<style scoped>
	#viewport-component * {
		background: none !important;
	}
</style>
<style>
	.lm_splitter {
		position: relative;
		z-index: 0;
		opacity: 0.5;
	}
	.lm_drag_handle:hover {
		opacity: 0;
	}
	.lm_splitter:hover, .lm_splitter.lm_dragging {
		background: #409EFF;
	}
	.lm_header {
		overflow: visible;
		position: relative;
		z-index: 0;
	}
	.selectBox {
		border: 1px solid #55aaff;
		background-color: rgba(75, 160, 255, 0.3);
		position: fixed;
	}
</style>
