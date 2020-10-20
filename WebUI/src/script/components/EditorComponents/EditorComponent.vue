<template>
	<gl-component ref="glChild">
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
