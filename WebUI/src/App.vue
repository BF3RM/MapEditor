<template>
	<div id="page">
		<div id="ViewportContainer">
		</div>
		<div id="glHolder">
			<golden-layout class="gl" @initialised="initialised">
				<gl-col :closable="false">
					<gl-row :closable="false">
						<PlaceholderComponent title="Hierarchy">
						</PlaceholderComponent>
						<!-- I'm adding two columns inside eachother. This makes it so only one side resizes when you resize it. -->
						<gl-col :closable="false" class="viewport-container">
							<gl-col :closable="false" class="viewport-container">
							</gl-col>
						</gl-col>
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

import PlaceholderComponent from '@/script/components/PlaceholderComponent.vue';
import { Component, Prop } from 'vue-property-decorator';
import ViewportComponent from '@/script/components/ViewportComponent.vue';
import { signals } from '@/script/modules/Signals';
import ExplorerComponent from '@/script/components/ExplorerComponent.vue';

import '@/style/reset.scss';
import PerfectScrollbar from 'perfect-scrollbar';
import 'perfect-scrollbar/css/perfect-scrollbar.css';

@Component({ components: { ViewportComponent, PlaceholderComponent, ExplorerComponent } })
export default class App extends Vue {
	@Prop()
	public title!: string;

	private initialised() {
		const ps = new PerfectScrollbar('.scrollable', {
		});
		signals.editorReady.emit(true);
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
