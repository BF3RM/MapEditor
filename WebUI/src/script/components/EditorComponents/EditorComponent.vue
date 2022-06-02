<template>
	<gl-component
		ref="glChild"
		class="EditorComponent"
		:title="title"
		:closable="closable"
		:hidden="hidden"
	>
		<slot />
	</gl-component>
</template>
<script lang="ts">
import { Component } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';

@Component
export default class EditorComponent extends glCustomContainer {
}
</script>
<style lang="scss">
.EditorComponent {
	.header {
		display: flex;
		padding: 7px;

		input[type="range"] {
			width: 8em;
			margin: 0 20px;
			-webkit-appearance: none;
			background: transparent !important;
		}

		input[type="range"]::-webkit-slider-thumb {
			-webkit-appearance: none;
			height: 20px;
			width: 10px;
			background: #ffffff;
			cursor: pointer;
			margin-top: -5px;
			border-radius: 3px;
		}

		input[type="range"]:focus {
			outline: none;

			&::-webkit-slider-thumb {
				background: #037fff;
			}
		}

		input[type="range"]::-webkit-slider-runnable-track {
			width: 100%;
			height: 8.4px;
			cursor: pointer;
			background: #161924;
			border-radius: 6px;
		}

		input[type="range"]:focus::-webkit-slider-runnable-track {
			background: #161924;
		}
	}
}
</style>
