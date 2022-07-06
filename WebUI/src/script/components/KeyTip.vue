<template>
	<div class="key-tip" v-if="description">
		<div v-if="needsCtrl" class="key-outline">CTRL</div>
		<div v-if="needsShift" class="key-outline">SHIFT</div>
		<!--div v-if="multiKey" class="multi-key-container">
			<div v-for="key in keys"
					:key="key"
					class="key-outline">
				{{ key }}
			</div>
		</div-->
		<div class="key-outline">{{ keys }}</div>
		<span>{{ description }}</span>
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class KeyTip extends Vue {
	@Prop()
	keys: string | string[];

	@Prop()
	needsCtrl?: boolean;

	@Prop()
	needsShift?: boolean;

	@Prop()
	description?: string;

	get multiKey() {
		return Array.isArray(this.keys);
	}
}
</script>

<style lang="scss" scoped>
.key-tip,
.multi-key-container {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: flex-start;
	user-select: none;
	color: #fff;
	font-size: 13px;
	line-height: 16px;

	.key-outline {
		border: 0.2vmin solid #fff;
		border-radius: 0.75vmin;
		margin: 0 0.5vmin 0 0;
		height: 3.25vmin;
		box-sizing: border-box;
		min-width: 3vmin;
		max-width: 5vmin;
		padding: 0 2vmin;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25vmin;
		line-height: 1.25vmin;
		color: #fff;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 1.25vmin;
		line-height: 1.45vmin;

		&:last-of-type {
			margin-right: 14px;
		}
	}
}
</style>
