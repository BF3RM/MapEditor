<template>
	<gl-component>
		<slot>
		</slot>
	</gl-component>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class EditorComponent extends glCustomContainer {
	@Prop({ default: true }) showHeader: boolean;
}
</script>
