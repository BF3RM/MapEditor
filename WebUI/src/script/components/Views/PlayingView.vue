<template>
	<div id="playing-view">
		<div id="container">
			<span id="logo">VeniceEditor</span>
			<span>F1 enable editor mode</span>
		</div>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class PlayingView extends Vue {

}
</script>

<style lang="scss" scoped>
	#playing-view {
		width: 100%;
		height: 100%;

		#container {
			position: absolute;
			background-color: #202020;
			color: white;
			top: 0;
			width: 100%;
			height: 5%;
			display: flex;
			align-items: center;

			span {
				margin-left: 5vmin;
			}

			#logo {
				color: #fff;
				font-weight: bolder;
				font-size: 20px;
				padding: 5px;
			}

		}
	}
</style>
