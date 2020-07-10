<template>
	<div id="loading-view">
		<div class="loader">
			<!--<spinner />-->
			<p>Loading <span/><span/><span/></p>
		</div>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({
	components: {

	}
})
export default class LoadingView extends Vue {
}
</script>

<style lang="scss" scoped>
	#loading-view {
		background-color: #202020;
		color: white;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;

		.loader {
			display: flex;

			p {
				font-size: 1.8vmin;
				font-weight: 400;
				margin: 0;

				span {
					&::after {
						content: ".";
					}

					animation: 1s blink infinite;

					&:nth-child(2) {
						animation-delay: 250ms
					}

					&:nth-child(3) {
						animation-delay: 500ms
					}
				}
			}

			@keyframes blink {
				50% { color: transparent }
			}
		}
	}
</style>
