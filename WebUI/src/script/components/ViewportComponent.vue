<template>
	<gl-component id="viewport-component">
	</gl-component>
</template>

<script lang="ts">
import { Component, Inject, Model, Prop, Watch, Emit } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class ViewportComponent extends glCustomContainer {
	@Prop() public title!: string;
	constructor(a:any, b:any) {
		super();
	}

	mounted() {

	}
	created() {

	}
}
</script>
