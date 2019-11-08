<template>
	<gl-component class="placeholder-component">
		<h1>Placeholder {{title}}</h1>
	</gl-component>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';

@Component
export default class PlaceholderComponent extends EditorComponent {
	@Prop() public title!: string;
	constructor() {
		super();
	}
}
</script>
