<template>
	<div id="page">
		<div id="ViewportContainer">
		</div>
		<div id="glHolder">
			<golden-layout class="gl" @initialised="onInitialised">
				<gl-col :closable="false">
					<gl-row :closable="false">
						<PlaceholderComponent title="Hierarchy">
						</PlaceholderComponent>
						<!-- I'm adding two columns inside eachother. This makes it so only one side resizes when you resize it. -->
						<gl-col :closable="false">
							<gl-col :closable="false" class="viewport-container">
							</gl-col>
							<gl-row :closable="false" :height="10">
								<ConsoleComponent title="Console"></ConsoleComponent>
							</gl-row>
						<gl-col :closable="false">
						</gl-col>
							<ViewportComponent title="ViewPort">
							</ViewportComponent>
						<ExplorerComponent title="Explorer">
						</ExplorerComponent>
					</gl-row>
				</gl-col>
			</golden-layout>
		</div>
	</div>
</template>
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

@Component({ components: { PlaceholderComponent, ExplorerComponent, ConsoleComponent } })
export default class App extends Vue {
	@Prop()
	public title!: string;

	private onInitialised() {
		const ps = new PerfectScrollbar('.scrollable', {
		});
		signals.editorReady.emit(true);
		const viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
			signals.editorReady.emit(true);
		}
	}
	private mounted() {
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
