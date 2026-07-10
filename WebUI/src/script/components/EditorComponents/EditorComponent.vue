<template>
	<div class="EditorComponent panel" v-show="!hidden">
		<div class="panel-header" v-if="title && showHeader">{{ title }}</div>
		<div class="panel-body">
			<slot />
		</div>
	</div>
</template>
<script lang="ts">
// Gameface port: golden-layout hard-crashes Coherent/Gameface (heavy DOM
// measurement + drag-drop docking). This base panel used to extend
// `glCustomContainer` and render a `<gl-component>`; it is now a plain flexbox
// panel with a header + body, hosted by the flexbox GoldenLayoutHolder.
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class EditorComponent extends Vue {
	@Prop({ default: '' }) readonly title!: string;
	@Prop({ default: true }) readonly closable!: boolean;
	@Prop({ default: false }) readonly hidden!: boolean;
	@Prop({ default: true }) readonly showHeader!: boolean;
}
</script>
<style lang="scss">
.EditorComponent.panel {
	display: flex;
	flex-direction: column;
	height: 100%;
	width: 100%;
	/* Flex items default to min-width:auto (won't shrink below content), so a panel
	   with wide content (the Inspector's EBX/transform rows) forces its flex column
	   wider and overflows to the right. min-width:0 lets it stay at its column width
	   and clip via overflow:hidden. */
	min-width: 0;
	overflow: hidden;
	/* Exact original mapeditor panel colours (from the .lm_content / .lm_header
	   overrides in style.scss). */
	background: rgba(31, 38, 51, 0.92);
	color: #8da1b6;
	box-sizing: border-box;
}
.EditorComponent.panel > .panel-header {
	flex: 0 0 auto;
	padding: 6px 10px;
	font-size: 12px;
	font-weight: 600;
	background: rgba(22, 25, 36, 1);
	border-bottom: 1px solid rgba(5, 7, 11, 0.6);
	color: #8fa6c0;
}
.EditorComponent.panel > .panel-body {
	flex: 1 1 auto;
	overflow: auto;
	min-height: 0;
}
.EditorComponent {
	.header {
		display: flex;
		padding: 7px;

		input[type='range'] {
			width: 8em;
			margin: 0 20px;
			-webkit-appearance: none;
			background: transparent !important;
		}

		input[type='range']::-webkit-slider-thumb {
			-webkit-appearance: none;
			height: 20px;
			width: 10px;
			background: #ffffff;
			cursor: pointer;
			margin-top: -5px;
			border-radius: 3px;
		}

		input[type='range']:focus {
			outline: none;

			&::-webkit-slider-thumb {
				background: #037fff;
			}
		}

		input[type='range']::-webkit-slider-runnable-track {
			width: 100%;
			height: 8.4px;
			cursor: pointer;
			background: #161924;
			border-radius: 6px;
		}

		input[type='range']:focus::-webkit-slider-runnable-track {
			background: #161924;
		}
	}
}
</style>
