<template>
	<div id="glHolder" class="fx-root">
		<div class="fx-main">
			<div class="fx-top">
				<div class="fx-hierarchy" :style="{ flexBasis: hierarchyWidth + 'px' }">
					<HierarchyComponent />
				</div>
				<div class="fx-divider-v" @mousedown="startDrag('hierarchy', $event)"></div>
				<div class="fx-viewport">
					<ViewportComponent :showHeader="true" :closable="false" />
				</div>
			</div>
			<div class="fx-divider-h" @mousedown="startDrag('bottom', $event)"></div>
			<div class="fx-bottom" :style="{ flexBasis: bottomHeight + 'px' }">
				<ExplorerComponent />
			</div>
		</div>
		<div class="fx-divider-v" @mousedown="startDrag('right', $event)"></div>
		<div class="fx-right" :style="{ flexBasis: rightWidth + 'px' }">
			<div class="fx-inspector">
				<InspectorComponent />
			</div>
			<div class="fx-divider-h" @mousedown="startDrag('overrides', $event)"></div>
			<div class="fx-overrides" :style="{ flexBasis: overridesHeight + 'px' }">
				<OverridesComponent />
			</div>
			<div class="fx-divider-h" @mousedown="startDrag('history', $event)"></div>
			<div class="fx-history" :style="{ flexBasis: historyHeight + 'px' }">
				<HistoryComponent />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
// Gameface port: golden-layout replaced with a static flexbox dock matching the
// original Chromium layout. The three "filler" regions (viewport, inspector, the
// top row) keep flex:1; only the fixed panels take a reactive flex-basis that the
// draggable dividers adjust -- so resizing never breaks the flex model.
import { defineComponent } from '@vue/composition-api';
import ViewportComponent from '@/script/components/EditorComponents/ViewportComponent.vue';
import InspectorComponent from '@/script/components/EditorComponents/Inspector/InspectorComponent.vue';
import HistoryComponent from '@/script/components/EditorComponents/HistoryComponent.vue';
import OverridesComponent from '@/script/components/EditorComponents/OverridesComponent.vue';
import HierarchyComponent from '@/script/components/EditorComponents/HierarchyComponent.vue';
import ExplorerComponent from '@/script/components/EditorComponents/ExplorerComponent.vue';

export default defineComponent({
	name: 'GoldenLayoutHolder',
	components: {
		ViewportComponent,
		InspectorComponent,
		HistoryComponent,
		OverridesComponent,
		HierarchyComponent,
		ExplorerComponent
	},
	data() {
		return {
			hierarchyWidth: 250,
			rightWidth: 340,
			bottomHeight: 200,
			historyHeight: 150,
			overridesHeight: 160
		};
	},
	methods: {
		onInitialised() {
			/* no-op in the flexbox layout */
		},
		startDrag(which: string, e: MouseEvent) {
			e.preventDefault();
			const startX = e.clientX;
			const startY = e.clientY;
			const start: { [k: string]: number } = {
				hierarchy: this.hierarchyWidth,
				right: this.rightWidth,
				bottom: this.bottomHeight,
				history: this.historyHeight,
				overrides: this.overridesHeight
			};
			const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
			const onMove = (ev: MouseEvent) => {
				// Self-heal: if Gameface dropped the mouseup, end the drag so it can't
				// get stuck and swallow later clicks.
				if (ev.buttons === 0) {
					onUp();
					return;
				}
				const dx = ev.clientX - startX;
				const dy = ev.clientY - startY;
				if (which === 'hierarchy') {
					this.hierarchyWidth = clamp(start.hierarchy + dx, 140, 700);
				} else if (which === 'right') {
					this.rightWidth = clamp(start.right - dx, 220, 800);
				} else if (which === 'bottom') {
					this.bottomHeight = clamp(start.bottom - dy, 90, 700);
				} else if (which === 'history') {
					this.historyHeight = clamp(start.history - dy, 60, 500);
				} else if (which === 'overrides') {
					this.overridesHeight = clamp(start.overrides - dy, 60, 600);
				}
			};
			const onUp = () => {
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
			};
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		}
	}
});
</script>

<style>
#glHolder.fx-root {
	position: absolute;
	top: 40px;
	left: 0;
	height: calc(100vh - 40px);
	width: 100vw;
	display: flex;
	flex-direction: row;
	pointer-events: auto;
}
.fx-main {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
}
.fx-top {
	flex: 1 1 auto;
	display: flex;
	flex-direction: row;
	min-height: 0;
}
.fx-hierarchy {
	flex-grow: 0;
	flex-shrink: 0;
	min-width: 0;
	display: flex;
}
.fx-viewport {
	flex: 1 1 auto;
	min-width: 0;
	/* The 3D world is drawn by the game engine behind the WebUI; keep this region
	   click-through so it's visible and pickable. */
	pointer-events: none;
}
/* Only the Viewport panel is transparent (so the game shows); every other panel
   keeps the dark semi-transparent background. */
.fx-viewport .EditorComponent.panel,
.fx-viewport .panel-body {
	background: transparent !important;
}
.fx-bottom {
	flex-grow: 0;
	flex-shrink: 0;
	min-height: 0;
	display: flex;
}
.fx-bottom > * {
	width: 100%;
}
.fx-right {
	flex-grow: 0;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	min-height: 0;
	min-width: 0;
	overflow: hidden;
}
.fx-inspector {
	flex: 1 1 auto;
	min-height: 0;
	min-width: 0;
	display: flex;
	overflow: hidden;
}
.fx-inspector > * {
	width: 100%;
}
.fx-history {
	flex-grow: 0;
	flex-shrink: 0;
	min-height: 0;
	display: flex;
}
.fx-history > * {
	width: 100%;
}
.fx-overrides {
	flex-grow: 0;
	flex-shrink: 0;
	min-height: 0;
	display: flex;
}
.fx-overrides > * {
	width: 100%;
}

/* Draggable dividers (like golden-layout splitters) */
.fx-divider-v {
	flex: 0 0 4px;
	cursor: col-resize;
	background: rgba(64, 158, 255, 0.15);
	pointer-events: auto;
	z-index: 5;
}
.fx-divider-v:hover {
	background: #409eff;
}
.fx-divider-h {
	flex: 0 0 4px;
	cursor: row-resize;
	background: rgba(64, 158, 255, 0.15);
	pointer-events: auto;
	z-index: 5;
}
.fx-divider-h:hover {
	background: #409eff;
}
</style>
