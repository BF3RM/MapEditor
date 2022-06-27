<template>
	<div id="loading-view">
		<div id="toolbar">
			<info-top-bar>
				<div class="loader">
					<!--<spinner />-->
					<p>{{ loadingInfo }} <span /><span /><span /></p>
				</div>
			</info-top-bar>
		</div>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import InfoTopBar from '@/script/components/InfoTopBar.vue';
import { signals } from '@/script/modules/Signals';

@Component({
	components: {
		InfoTopBar
	}
})
export default class LoadingView extends Vue {
	loadingInfo = 'Loading resources';
	mounted() {
		signals.setLoadingInfo.connect((info) => {
			console.log('Got loading info');
			this.loadingInfo = info;
			this.$forceUpdate();
		});
	}
}
</script>

<style lang="scss" scoped>
#loading-view {
	width: 100%;
	height: 100%;

	.loader {
		display: flex;

		p {
			font-size: 1.5em;
			font-weight: 400;
			margin: 0;

			span {
				&::after {
					content: '.';
				}

				animation: 1s blink infinite;

				&:nth-child(2) {
					animation-delay: 250ms;
				}

				&:nth-child(3) {
					animation-delay: 500ms;
				}
			}
		}

		@keyframes blink {
			50% {
				color: transparent;
			}
		}
	}
}
</style>
