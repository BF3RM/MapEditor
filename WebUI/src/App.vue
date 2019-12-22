<template>
	<div id="page">
		<EditorToolbar></EditorToolbar>
		<div id="ViewportContainer">
		</div>
		<div id="glHolder">
			<golden-layout class="gl" @initialised="onInitialised" ref="gl">
				<gl-col>
					<gl-row>
						<gl-col width="15">
							<HierarchyComponent title="Hierarchy"/>
						</gl-col>
						<gl-col>
							<gl-row ref="viewport" height=80>
								<ViewportComponent reorderEnabled="false" title="ViewPort"/>
							</gl-row>
							<gl-row height=20>
								<ConsoleComponent title="Console" />
							</gl-row>
						</gl-col>
						<gl-col width=15>
							<ExplorerComponent title="Explorer"/>
						</gl-col>
					</gl-row>
				</gl-col>
			</golden-layout>
		</div>
	</div>
</template> TabNine::config
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

@Component({ components: { PlaceholderComponent, ExplorerComponent, ConsoleComponent, ViewportComponent, HierarchyComponent, EditorToolbar } })
export default class App extends Vue {
	@Prop()
	public title: string;

	private onInitialised() {
		const scrollables = document.getElementsByClassName('scrollable');
		for (const scrollable of scrollables as any) {
			const ps = new PerfectScrollbar(scrollable as HTMLElement, {
			});
		}
		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
			signals.editor.Ready.emit(true);
		}
	}

	public mounted() {
		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
		}
		window.onload = () => {
			// Component height is set the tick before it's actually rendered, so it gets set to 0.
			// So we wait a tick and trigger a resize event on the now rendered layout.
			setTimeout(() => {
				(this.$refs.gl as any).layout.onResize();
			}, 1);
		};
	}
}
</script>

<style scoped>
	.gl {
		height: 100%;
	}
	#glHolder {
		height:100vh;
		width:100vw;
	}
	#viewport-container * {
		background: none !important;
		pointer-events: none;
	}
	#glHolder {
		pointer-events: none;
	}
</style>
