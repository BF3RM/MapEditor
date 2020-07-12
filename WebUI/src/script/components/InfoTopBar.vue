<template>
	<div id="container">
		<span id="logo">VeniceEditor</span>
		<slot/>
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class InfoTopBar extends Vue {
	@Prop()
	keyName!: string;

	@Prop()
	description!: string;
}
</script>

<style lang="scss" scoped>
	#container {
		position: absolute;
		background-color: #202020;
		color: white;
		top: 0;
		width: 100vw;
		height: 5vh;
		display: flex;
		align-items: center;

		> * {
			margin-left: 3vmin;
		}

		#logo {
			margin-left: 5vmin;
			color: #fff;
			font-weight: bolder;
			font-size: 20px;
			padding: 5px;
		}
	}
</style>
