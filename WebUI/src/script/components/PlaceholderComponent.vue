<template>
	<gl-component class="placeholder-component">
		<h1>Placeholder {{title}}</h1>
	</gl-component>
</template>
<script lang="ts">
import Vue from 'vue';
import { Component, Inject, Model, Prop, Watch, Emit } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class PlaceholderComponent extends glCustomContainer {
	@Prop() private title: string;
}
</script>
