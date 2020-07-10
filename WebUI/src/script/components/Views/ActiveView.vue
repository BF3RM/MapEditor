<template>
	<div class="screen-container">
		<transition name="fade">
			<component :is="activeViewComponent" class="screen"/>
		</transition>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { VIEW } from '../../types/Enums';
import { signals } from '@/script/modules/Signals';

@Component
export default class ActiveView extends Vue {
	activeViewName: VIEW = VIEW.LOADING;

	mounted() {
		signals.setActiveView.connect(this.onSetActiveView.bind(this));
	}

	get activeViewComponent() {
		if (!this.activeViewName) {
			return null;
		}

		return () => import(`./${this.activeViewName}View.vue`);
	}

	onSetActiveView(newActiveView: VIEW) {
		this.activeViewName = newActiveView;
	}
}
</script>

<style>
	.screen-container {
		position: relative;
		width: 100vw;
		height: 100vh;
	}
	.screen {
		position: absolute;
		width: 100vw;
		height: 100vh;
		top: 0;
	}
</style>
