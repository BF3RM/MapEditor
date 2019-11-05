<template>
	<gl-component id="explorer-component">
		<tree/>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import tree from './tree.vue';
@Component({ components: { tree } })

export default class ExplorerComponent extends glCustomContainer {
	@Prop() public title!: string;

	constructor() {
		super();
	}
}
</script>
