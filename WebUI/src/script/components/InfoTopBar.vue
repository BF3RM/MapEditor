<template>
	<div id="container">
		<span id="logo"> VeniceEditor </span>
		<slot />
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class InfoTopBar extends Vue {
	@Prop()
	keyName: string;

	@Prop()
	description: string;
}
</script>

<style lang="scss" scoped>
#container {
	position: relative;
	color: #fff;
	top: 0;
	width: 100vw;
	display: flex;
	align-items: center;

	> * {
		margin-left: 3vmin;
	}

	#logo {
		margin-left: 0.5em;
		color: #fff;
		font-weight: 600;
		font-size: 15px;
		padding: 4px 11px;
		height: 100%;
		background: #0774e5;
		border-radius: 6px;
		background: rgb(7, 116, 229);
		background: linear-gradient(319deg, rgba(7, 116, 229, 1) 0%, rgba(7, 142, 229, 1) 100%);
		box-shadow: 0 0px 7px 0px rgba(3, 127, 255, 0.6);
	}
}
</style>
