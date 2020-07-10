<template>
	<golden-layout :showPopoutIcon=false :showCloseIcon=false class="gl" @initialised="onInitialised" ref="gl" @stackCreated="onStackCreated">
		<gl-row>
			<gl-col :width="80">
				<gl-row :height="80">
					<gl-col :width="20">
						<HierarchyComponent/>
					</gl-col>
					<gl-col width="80">
						<ViewportComponent :showHeader="true"/>
					</gl-col>
				</gl-row>
				<gl-row :height="20">
					<ExplorerComponent :width="70"/>
					<ConsoleComponent/>
				</gl-row>
			</gl-col>
			<gl-col :width="20">
				<gl-stack>
					<InspectorComponent/>
					<HistoryComponent/>
				</gl-stack>
			</gl-col>
		</gl-row>
	</golden-layout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { signals } from '@/script/modules/Signals';
import ExplorerComponent from '@/script/components/EditorComponents/ExplorerComponent.vue';
import ConsoleComponent from '@/script/components/EditorComponents/ConsoleComponent.vue';
import ViewportComponent from '@/script/components/EditorComponents/ViewportComponent.vue';
import HierarchyComponent from '@/script/components/EditorComponents/HierarchyComponent.vue';
import InspectorComponent from '@/script/components/EditorComponents/InspectorComponent.vue';
import HistoryComponent from '@/script/components/EditorComponents/HistoryComponent.vue';
import PerfectScrollbar from 'perfect-scrollbar';

@Component({
	components: {
		ExplorerComponent,
		ConsoleComponent,
		ViewportComponent,
		HierarchyComponent,
		InspectorComponent,
		HistoryComponent
	}
})
export default class GoldenLayoutHolder extends Vue {
	public mounted() {
		(this.$refs.gl as any).layout.config.settings = {
			hasHeaders: true,
			reorderEnabled: true,
			selectionEnabled: true,
			popoutWholeStack: true,
			closePopoutsOnUnload: false,
			showPopoutIcon: false,
			showMaximiseIcon: true,
			showCloseIcon: false
		};

		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
		}
		window.onload = () => {
			// Component height is set the tick before it's actually rendered, so it gets set to 0.
			// So we wait a tick and trigger a resize event on the now rendered layout.
			setTimeout(() => {
				(this.$refs.gl as any).layout.onResize();
				const scrollables = document.getElementsByClassName('scrollable');
				for (const scrollable of scrollables as any) {
					const ps = new PerfectScrollbar(scrollable as HTMLElement, {
					});
				}
			}, 1);
		};
	}

	private onInitialised() {
		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
			signals.editor.Ready.emit(true);
		}
	}

	private onStackCreated(stack: any) {
		if (stack.contentItems.length > 0) {
			setTimeout(() => {
				if (!stack.contentItems[0].vueObject.$vnode.context.showHeader) {
					stack.header.position(false);
				}
			}, 1);
		}
	}
}
</script>

<style>
	.gl {
		height: 100%;
	}
	#glHolder {
		height: calc(100vh - 35px);
		width: 100vw;
	}
	#glHolder {
		pointer-events: none;
	}
</style>
