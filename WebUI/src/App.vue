<template>
	<div id="page">
		<EditorToolbar></EditorToolbar>
		<div id="ViewportContainer">
		</div>
		<div id="glHolder">
			<golden-layout :showPopoutIcon=false :showCloseIcon=false class="gl" @initialised="onInitialised" ref="gl" @stackCreated="onStackCreated">
				<gl-row>
					<gl-col :width="80">
						<gl-row :height="80">
							<gl-col :width="20">
								<HierarchyComponent title="Hierarchy"/>
							</gl-col>
							<gl-col width="80">
								<ViewportComponent :showHeader="false" title="ViewPort"/>
							</gl-col>
						</gl-row>
						<gl-row :height="20">
							<ExplorerComponent :width="70" title="Project"/>
							<ConsoleComponent :width="30" title="Console" />
						</gl-row>
					</gl-col>
					<gl-col :width="20">
						<InspectorComponent title="Inspector"/>
					</gl-col>
				</gl-row>
			</golden-layout>
		</div>
	</div>
</template>
<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { signals } from '@/script/modules/Signals';
import PerfectScrollbar from 'perfect-scrollbar';
import PlaceholderComponent from '@/script/components/EditorComponents/PlaceholderComponent.vue';
import ExplorerComponent from '@/script/components/EditorComponents/ExplorerComponent.vue';
import ConsoleComponent from '@/script/components/EditorComponents/ConsoleComponent.vue';
import '@/style/reset.scss';
import 'perfect-scrollbar/css/perfect-scrollbar.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import './style/style.scss';
import './style/icons.scss';

import ViewportComponent from '@/script/components/EditorComponents/ViewportComponent.vue';
import ListComponent from '@/script/components/EditorComponents/ListComponent.vue';
import HierarchyComponent from '@/script/components/EditorComponents/HierarchyComponent.vue';
import EditorToolbar from '@/script/components/EditorComponents/EditorToolbar.vue';
import InspectorComponent from '@/script/components/EditorComponents/InspectorComponent.vue';

@Component({ components: { PlaceholderComponent, ExplorerComponent, ConsoleComponent, ViewportComponent, HierarchyComponent, EditorToolbar, InspectorComponent } })
export default class App extends Vue {
	@Prop()
	public title: string;

	private onInitialised() {
		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
			signals.editor.Ready.emit(true);
		}
	}

	public mounted() {
		console.log(this.$refs.gl);
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

	private onStackCreated(stack: any) {
		if (stack.contentItems.length > 0) {
			console.log(stack.contentItems);
			setTimeout(() => {
				console.log(stack.contentItems[0].vueObject.$vnode.context.showHeader);
				if (stack.contentItems[0].vueObject.$vnode.context.showHeader === false) {
					console.log(stack);
					stack.header.position(false);
				}
			}, 1);
		}
	}
}
</script>

<style scoped>
	.gl {
		height: 100%;
	}
	#glHolder {
		height: calc(100vh - 35px);
		width: 100vw;
	}
	#viewport-container * {
		background: none !important;
		pointer-events: none;
	}
	#glHolder {
		pointer-events: none;
	}
</style>
