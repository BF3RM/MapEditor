<template>
	<info-top-bar>
		<key-tip
			:keys="'F1'"
			:description="'Enable editor mode'"/>
	</info-top-bar>
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
export default class PlayingView extends Vue {

}
</script>

<style lang="scss" scoped>
	#playing-view {
		width: 100%;
		height: 100%;
	}
</style>
