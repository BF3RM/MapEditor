<template>
	<div class="key-tip">
		<div class="key-outline">{{ keyName }}</div>
		<span>{{ description }}</span>
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class KeyTip extends Vue {
	@Prop()
	keyName!: string;

	@Prop()
	description!: string;
}
</script>

<style lang="scss" scoped>
	.key-tip {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		user-select: none;

		.key-outline {
			padding: 0.4vmin;
			border: 1px solid white;
			border-radius: 3px;
			margin: 0 1vmin;
		}
	}
</style>
