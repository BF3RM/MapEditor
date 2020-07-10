<template>
	<div>
		<EditorToolbar/>
		<div id="ViewportContainer"></div>
		<GoldenLayoutHolder/>
		<ProjectSettingsComponent>sup</ProjectSettingsComponent>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import EditorToolbar from '../EditorComponents/EditorToolbar.vue';
import ProjectSettingsComponent from '../WindowComponents/ProjectSettingsComponent.vue';
import GoldenLayoutHolder from '@/script/components/GoldenLayoutHolder.vue';
import ViewportComponent from '@/script/components/EditorComponents/ViewportComponent.vue';

@Component({
	components: {
		GoldenLayoutHolder,
		EditorToolbar,
		ProjectSettingsComponent
	}
})
export default class EditorView extends Vue {
	public mounted() {
		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
		}
	}
}
</script>

<style scoped>

</style>
