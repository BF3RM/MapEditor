<template>
	<div id="page">
		<ActiveView/>
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

@Component({
	components: {
		ActiveView
	}
})
export default class App extends Vue {
	constructor() {
		super();
		let debugMode: boolean = false;
		if (!navigator.userAgent.includes('VeniceUnleashed')) {
			if (window.location.ancestorOrigins === undefined || window.location.ancestorOrigins[0] !== 'webui://main') {
				debugMode = true;
			}
		}

		window.debug = debugMode;
		(window).editor = new Editor(debugMode);
		(window).Log = Log;
		(window).LogError = LogError;
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
	#viewport-container * {
		background: none !important;
		pointer-events: none;
	}
</style>
<style>
	.lm_splitter {
		position: relative;
		z-index: 0;
	}
	.lm_header {
		overflow: visible;
		position: relative;
		z-index: 0;
	}
</style>
