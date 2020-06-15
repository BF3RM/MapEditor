<template>
	<gl-component :title="title">
		<slot>
		</slot>
	</gl-component>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class EditorComponent extends glCustomContainer {
	@Prop({ default: true }) showHeader: boolean;
	@Prop({ default: false }) isDestructible: boolean;
	@Prop({ default: 'EditorComponent' }) title: string;
	public beforeDestroy() {
		console.log('Destroy');
		if (!this.isDestructible) {
			console.log('Reloading UI');
			// Hack to force a complete UI reload when a component is destroyed because we did a hot-reload
			// eslint-disable-next-line no-self-assign
			window.location = window.location;
		}
	}
}
</script>
