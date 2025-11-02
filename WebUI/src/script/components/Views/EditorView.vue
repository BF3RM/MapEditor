<template>
	<div @mouseup="onMouseUp">
		<EditorToolbar />
		<div id="ViewportContainer"></div>
		<GoldenLayoutHolder />
		<div class="overlays">
			<ProjectSettingsComponent />
			<ImportProjectComponent />
			<HotkeysComponent />
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import EditorToolbar from '../EditorComponents/EditorToolbar.vue';
import ProjectSettingsComponent from '../WindowComponents/ProjectSettingsComponent.vue';
import GoldenLayoutHolder from '@/script/components/GoldenLayoutHolder.vue';
import ImportProjectComponent from '@/script/components/WindowComponents/ImportProjectComponent.vue';
import HotkeysComponent from '@/script/components/WindowComponents/HotkeysComponent.vue';

export default defineComponent({
    name: 'EditorView',
    components: {
        HotkeysComponent,
        ImportProjectComponent,
        GoldenLayoutHolder,
        EditorToolbar,
        ProjectSettingsComponent
    },
    methods: {
        onMouseUp(e: any) {
            window.editor.threeManager.onDragStop(e);
        }
    },
    mounted() {
        const viewport = document.getElementById('viewport-component');
        if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
            viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
        }
    }
});
</script>

<style scoped>
.overlays {
	position: absolute;
	top: 0;
	left: 0;
	height: 100vh;
	width: 100vw;
	pointer-events: none;
}
</style>
