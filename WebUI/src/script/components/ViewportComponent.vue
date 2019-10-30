<template>
	<gl-component id="viewport-component">
		<h1>Viewport</h1>
	</gl-component>
</template>

<script lang="ts">
import { Component, Inject, Model, Prop, Watch, Emit } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class ViewportComponent extends glCustomContainer {
	@Prop() public title!: string;
	constructor() {
		super();
	}
}
</script>
