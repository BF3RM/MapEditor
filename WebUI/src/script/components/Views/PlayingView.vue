<template>
	<div id="toolbar" class="in-game">
		<info-top-bar>
			<key-tip :keys="'F1'" :description="'Enable editor mode'" />
		</info-top-bar>
	</div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import KeyTip from '@/script/components/KeyTip.vue';
import InfoTopBar from '@/script/components/InfoTopBar.vue';

@Component({
	components: {
		InfoTopBar,
		KeyTip
	}
})
export default class PlayingView extends Vue {}
</script>

<style lang="scss" scoped>
#toolbar {
	::v-deep .key-tip {
		font-size: 15px;

		.key-outline {
			height: 23px;
		}
	}
}
</style>
