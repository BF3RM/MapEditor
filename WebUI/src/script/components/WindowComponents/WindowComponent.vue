<template>
	<div class="window">
		<div class="header">
			<div class="title">{{title}}</div>
		</div>
		<div class="content">
			<slot>
			</slot>
		</div>
	</div>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class WindowComponent extends Vue {
	@Prop({ default: true }) showHeader: boolean;
	@Prop({ default: false }) isDestructible: boolean;
	@Prop({ default: 'WindowComponent' }) title: string;
}
</script>
<style lang="scss" scoped>
	.window {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		background-color: rgba(34, 34, 34, 0.8) !important;
	}
	.header {
		color: #fff;
		background-color: rgba(34, 34, 34, 0.8) !important;
		padding: 5px;
	}
	.content {
		color: #999;
		padding: 5px;
	}
</style>
