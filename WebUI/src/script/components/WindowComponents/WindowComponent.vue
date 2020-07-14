<template>
	<div class="window lm_header" v-show="state.visible">
		<div class="header lm_tab">
			<div class="title">{{title}}</div>
			<div v-if="isDestructible" class="lm_close_tab" @click="state.visible = false"></div>
		</div>
		<div class="content lm_content">
			<slot>
			</slot>
		</div>
	</div>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import { signals } from '@/script/modules/Signals';
import IWindowState from './IWindowState';
@Component
export default class WindowComponent extends Vue {
	@Prop({ default: true }) showHeader: boolean;
	@Prop({ default: false }) isDestructible: boolean;
	@Prop({ default: 'WindowComponent' }) title: string;
	@Prop({ default: { visible: true } }) state: IWindowState;
}
</script>
<style lang="scss" scoped>
	.window {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		background-color: rgba(34, 34, 34, 0.8) !important;
		display: grid;
		height: auto;
		width: auto;
	}
	.header {
		color: #fff;
		background-color: rgba(34, 34, 34, 0.8) !important;
		padding: 5px;
		grid-row: 1;
	}
	.content {
		color: #999;
		padding: 5px;
		grid-row: 2;
		height: 100%;
	}
</style>
