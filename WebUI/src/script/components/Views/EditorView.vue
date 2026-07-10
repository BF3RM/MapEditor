<template>
	<div @mouseup="onMouseUp">
		<EditorToolbar />
		<div id="ViewportContainer"></div>
		<GoldenLayoutHolder />
		<!-- Overlays (File menu windows). Each WindowComponent is v-show-hidden until
		     opened, so the fullscreen backdrop only exists while a window is visible;
		     the wrapper is pointer-events:none so it never blocks the editor when all
		     are closed. Mounting them also registers the File menu entries. -->
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
import GoldenLayoutHolder from '@/script/components/GoldenLayoutHolder.vue';
import ProjectSettingsComponent from '@/script/components/WindowComponents/ProjectSettingsComponent.vue';
import ImportProjectComponent from '@/script/components/WindowComponents/ImportProjectComponent.vue';
import HotkeysComponent from '@/script/components/WindowComponents/HotkeysComponent.vue';

export default defineComponent({
    name: 'EditorView',
    components: {
        GoldenLayoutHolder,
        EditorToolbar,
        ProjectSettingsComponent,
        ImportProjectComponent,
        HotkeysComponent
    },
    methods: {
        onMouseUp(e: any) {
            window.editor.threeManager.onDragStop(e);
        }
    },
    mounted() {
        // NOTE (Gameface port): removed the golden-layout hack that set
        // id="viewport-container" on viewport.parentElement.parentElement. In the
        // flexbox layout that element is `.fx-top`, and the global rule
        // `#viewport-container * { background: none !important }` was wiping the
        // background off every panel inside fx-top (i.e. the Hierarchy panel).
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
