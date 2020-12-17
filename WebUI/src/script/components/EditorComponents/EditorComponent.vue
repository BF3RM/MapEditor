<template>
	<gl-component ref="glChild" class="EditorComponent">
		<slot>
		</slot>
	</gl-component>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import { goldenChild } from 'vue-golden-layout/roles/child';

@Component
export default class EditorComponent extends glCustomContainer {
	@Prop({ default: false }) hasHeaders: boolean;
	@Prop({ default: false }) closable: boolean;
	@Prop({ default: false }) hidden: boolean;
	@Prop({ default: 'EditorComponent' }) title: string;

	mounted() {
	}
}
</script>
<style lang="scss">
.EditorComponent {
	.header {
		display: flex;

		input[type="range"] {
			width: 10em;
		}
	}
}
</style>
