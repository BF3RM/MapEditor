<template>
	<gl-component id="viewport-component">
	</gl-component>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import EditorComponent from './EditorComponent.vue';

@Component
export default class ViewportComponent extends EditorComponent {
}
</script>
