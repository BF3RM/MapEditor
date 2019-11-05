<template>
	<div id="page">
		<div id="ViewportContainer">
		</div>
		<div id="glHolder">
			<golden-layout class="gl" @initialised="initialised">
				<gl-col :closable="false">
					<gl-row :closable="false">
						<gl-col :closable="false">
							<PlaceholderComponent title="Hierarchy">
							</PlaceholderComponent>
						</gl-col>
							<ViewportComponent title="ViewPort">
							</ViewportComponent>
						<PlaceholderComponent title="Explorer">
						</PlaceholderComponent>
					</gl-row>
				</gl-col>

			</golden-layout>
		</div>
		<div>
			<h1>End</h1>
		</div>
	</div>
</template>
<script lang="ts">
import Vue from 'vue';

import PlaceholderComponent from '@/script/components/PlaceholderComponent.vue';
import { Component, Prop } from 'vue-property-decorator';
import ViewportComponent from '@/script/components/ViewportComponent.vue';
import { signals } from '@/script/modules/Signals';

@Component({ components: { ViewportComponent, PlaceholderComponent } })
export default class App extends Vue {
	@Prop()
	public title!: string;

	initialised() {
		let viewport = document.getElementById('viewport-component');
		if (viewport !== null && viewport.parentElement !== null && viewport.parentElement.parentElement !== null) {
			viewport.parentElement.parentElement.setAttribute('id', 'viewport-container');
			signals.editorReady.emit(true);
		}
	}
	mounted() {
		let viewport = document.getElementById('viewport-component');
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
