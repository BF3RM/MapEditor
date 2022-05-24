<template>
	<div class="window-wrapper" v-show="state.visible">
		<div class="window lm_header">
			<div class="header lm_tab">
				<div class="title">{{title}}</div>
				<div v-if="isDestructible" class="lm_close_tab" @click="state.visible = false"></div>
			</div>
			<div class="content lm_content">
				<slot>
				</slot>
			</div>
		</div>
		<div class="overlay"></div>
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
	.overlay {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		right: 0;
		background: rgba(13, 15, 22, .78);
		z-index: 40;
		pointer-events: all;
	}

	.window {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: grid;
		height: 45vh;
		width: 35vw;
		display: flex;
		flex-flow: column;
		z-index: 50;
		border-radius: 6px;
		overflow: hidden;

		.header {
			&.lm_tab {
				margin: 0;
				padding: 5px 15px !important;

				.lm_close_tab {
					width: 28px;
					height: 17px;
					position: absolute;
					top: 0;
					right: 0;
					text-align: center;
				}

				&:hover {
					background: transparent !important;
					color: #7a8797 !important;
				}
			}
		}

		.content {
			padding: 1.5vh;
			height: 100%;
			display: flex;
			flex-flow: column;

			.container {
				flex: 1 1 auto;
				margin-bottom: 1.5vh;
			}

			.footer {
				display: flex;
				flex-flow: row;
				justify-content: flex-end;

				.btn {
					margin-right: 4px;

					&:last-of-type {
						margin: 0;
					}
				}
			}
		}
	}

</style>
