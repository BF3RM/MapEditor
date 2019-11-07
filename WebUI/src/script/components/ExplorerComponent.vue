<template>
	<gl-component id="explorer-component">
		<tree/>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import tree from './tree.vue';
import EditorComponent from './EditorComponent.vue';
@Component({ components: { tree } })

export default class ExplorerComponent extends EditorComponent {
	@Prop() public title!: string;

	constructor() {
		super();
	}
}
</script>
