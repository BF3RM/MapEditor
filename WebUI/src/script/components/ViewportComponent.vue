<template>
	<gl-component id="viewport-component">
	</gl-component>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class ViewportComponent extends glCustomContainer {
}
</script>
