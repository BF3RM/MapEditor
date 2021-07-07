<template>
	<gl-component
			ref="glChild"
			class="EditorComponent"
			:title="title"
			:closable="closable"
			:hidden="hidden">
		<slot />
	</gl-component>
</template>
<script lang="ts">
import { Component } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class EditorComponent extends glCustomContainer {
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
