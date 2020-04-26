<template>
	<gl-component id="viewport-component">
	</gl-component>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
@Component
export default class ViewportComponent extends EditorComponent {
}
</script>
