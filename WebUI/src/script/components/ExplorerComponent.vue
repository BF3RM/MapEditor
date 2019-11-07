<template>
	<gl-component id="explorer-component">
		<ExampleTree/>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import ExampleTree from './ExampleTree.vue';
import EditorComponent from './EditorComponent.vue';
@Component({ components: { ExampleTree } })

export default class ExplorerComponent extends EditorComponent {
	@Prop() public title!: string;

	constructor() {
		super();
	}
}
</script>
