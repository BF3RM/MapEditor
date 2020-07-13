<template>
	<div id="editor-view">
<!--		<info-top-bar></info-top-bar>-->
		<EditorToolbar id="toolbar"/>
		<div id="ViewportContainer"></div>
		<GoldenLayoutHolder id="golden-layout-holder"/>
		<ProjectSettingsComponent>sup</ProjectSettingsComponent>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import EditorToolbar from '../EditorComponents/EditorToolbar.vue';
import ProjectSettingsComponent from '../WindowComponents/ProjectSettingsComponent.vue';
import GoldenLayoutHolder from '@/script/components/GoldenLayoutHolder.vue';
import InfoTopBar from '@/script/components/InfoTopBar.vue';

@Component({
	components: {
		InfoTopBar,
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

<style scoped lang="scss">
	#editor-view {
		position: relative;
		#golden-layout-holder {
			position: relative;
			width: 100vw;
			height: 95vh;
		}
	}
</style>
