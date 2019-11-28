<template>
	<div id="page">
		<div id="ViewportContainer">
		</div>
		<div id="glHolder">
			<golden-layout class="gl" @initialised="onInitialised">
				<gl-col>
					<gl-row>
						<gl-col>
							<HierarchyComponent title="Hierarchy"/>
						</gl-col>
						<gl-col>
							<gl-row>
								<ViewportComponent title="ViewPort"/>
							</gl-row>
							<gl-row>
								<ConsoleComponent title="Console"/>
							</gl-row>
						</gl-col>
						<gl-col>
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
import PlaceholderComponent from '@/script/components/PlaceholderComponent.vue';
import ExplorerComponent from '@/script/components/ExplorerComponent.vue';
import ConsoleComponent from '@/script/components/ConsoleComponent.vue';
import '@/style/reset.scss';
import 'perfect-scrollbar/css/perfect-scrollbar.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import './style/style.scss';

import ViewportComponent from '@/script/components/ViewportComponent.vue';
import ListComponent from '@/script/components/ListComponent.vue';
import HierarchyComponent from '@/script/components/HierarchyComponent.vue';

@Component({ components: { PlaceholderComponent, ExplorerComponent, ConsoleComponent, ViewportComponent, HierarchyComponent } })
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
