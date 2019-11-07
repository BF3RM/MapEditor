<template>
	<gl-component class="placeholder-component">
		<h1>Placeholder {{title}}</h1>
	</gl-component>
</template>
<script lang="ts">
import { Component, Inject, Model, Prop, Watch, Emit } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import EditorComponent from './EditorComponent.vue';

@Component
export default class ViewportComponent extends EditorComponent {
	@Prop() public title!: string;
	constructor() {
		super();
	}
}
</script>
