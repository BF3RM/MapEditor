<template>
	<div class="screen-container">
		<EditorView class="screen" v-show="activeViewName === viewEnum.EDITOR" />
		<PlayingView class="screen" v-show="activeViewName === viewEnum.PLAYING" />
		<LoadingView class="screen" v-show="activeViewName === viewEnum.LOADING" />
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { VIEW } from '../../types/Enums';
import { signals } from '@/script/modules/Signals';
import EditorView from '@/script/components/Views/EditorView.vue';
import PlayingView from '@/script/components/Views/PlayingView.vue';
import LoadingView from '@/script/components/Views/LoadingView.vue';
@Component({
	components: { LoadingView, PlayingView, EditorView }
})
export default class ActiveView extends Vue {
	activeViewName: VIEW = VIEW.EDITOR;
	viewEnum = VIEW;

	mounted() {
		signals.setActiveView.connect(this.onSetActiveView.bind(this));
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
