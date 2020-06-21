<template>
	<WindowComponent title="Project Settings">
		<div>
			hi
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import WindowComponent from './WindowComponent.vue';

@Component({ components: { WindowComponent } })
export default class ProjectSettingsComponent extends WindowComponent {
}
</script>
