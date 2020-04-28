<template>
	<gl-component id="viewport-component">
		<div id="stats" ref="stats"/>
	</gl-component>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { signals } from '@/script/modules/Signals';
@Component
export default class ViewportComponent extends EditorComponent {
	constructor() {
		super();
		signals.editor.Ready.connect(this.drawStats.bind(this));
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
