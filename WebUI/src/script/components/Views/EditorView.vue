<template>
	<div>
		<EditorToolbar/>
		<div id="ViewportContainer"/>
		<GoldenLayoutHolder/>
		<GoldenLayoutHolder/>
		<ProjectSettingsComponent>sup</ProjectSettingsComponent>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import EditorToolbar from '../EditorComponents/EditorToolbar.vue';
import ProjectSettingsComponent from '../WindowComponents/ProjectSettingsComponent.vue';
import GoldenLayoutHolder from '@/script/components/GoldenLayoutHolder.vue';

@Component({
	components: {
		GoldenLayoutHolder,
		EditorToolbar,
		ProjectSettingsComponent
	}
})
export default class EditorView extends Vue {
}
</script>

<style scoped>

</style>
