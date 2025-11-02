<template>
	<div id="toolbar" class="in-game">
		<info-top-bar>
			<key-tip :keys="'F1'" :description="'Enable editor mode'" />
		</info-top-bar>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import KeyTip from '@/script/components/KeyTip.vue';
import InfoTopBar from '@/script/components/InfoTopBar.vue';

export default defineComponent({
    name: 'PlayingView',
    components: {
        InfoTopBar,
        KeyTip
    }
});
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
