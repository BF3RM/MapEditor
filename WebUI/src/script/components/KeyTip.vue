<template>
	<div class="key-tip">
		<div v-if="modifierKey" class="key-outline">{{ modifierKey }}</div>
		<div v-if="modifierKey">+</div>
		<div v-if="multiKey" class="multi-key-container">
			<div v-for="key in keys"
					:key="key"
					class="key-outline">
				{{ key }}
			</div>
		</div>
		<div v-else class="key-outline">{{ keys }}</div>
		<span v-if="description">{{ description }}</span>
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class KeyTip extends Vue {
	@Prop()
	keys: string | string[];

	@Prop()
	modifierKey?: string;

	@Prop()
	description?: string;

	get multiKey() {
		return Array.isArray(this.keys);
	}
}
</script>

<style lang="scss" scoped>
	.key-tip, .multi-key-container {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		user-select: none;

		.key-outline {
			padding: 0.4vmin;
			border: 1px solid white;
			border-radius: 3px;
			margin: 0 0.5vmin;
		}
	}
</style>
