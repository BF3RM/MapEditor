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
		border: 2px solid #fff;
		border-radius: 6px;
		margin: 0 7px 0 0;
		height: 30px;
		box-sizing: border-box;
		min-width: 30px;
		max-width: 65px;
		padding: 0 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: #fff;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		font-weight: 600;

		&:last-of-type {
			margin-right: 14px;
		}
	}
}
</style>
