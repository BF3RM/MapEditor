<template>
	<div class="Vec3Control">
		<div class="label">
			<span v-if="label">{{label}}</span>
		</div>
		<DraggableNumberInput
				class="x"
				label="X"
				type="Float"
				dragDirection="X"
				:hideLabel="hideLabel"
				:value="value.x"
				:step=step
				:min=min
				@input="onChangeValue('x', $event)"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')" />
		<DraggableNumberInput
				class="y"
				label="Y"
				type="Float"
				dragDirection="X"
				:hideLabel="hideLabel"
				:value="value.y"
				:step=step
				:min=min
				@input="onChangeValue('y', $event)"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')" />
		<DraggableNumberInput
				class="z"
				type="Float"
				label="Z"
				dragDirection="X"
				:hideLabel="hideLabel"
				:value="value.z"
				:step=step
				:min=min
				@input="onChangeValue('z', $event)"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')" />
		<!--div class="actions">
			<div class="copy-btn" @click="onCopy">
				<img :src="require('@/icons/editor/new/copy.svg')" v-tooltip="'Copy values'" />
			</div>
			<div class="paste-btn" @click="onPaste">
				<img :src="require('@/icons/editor/new/paste.svg')" v-tooltip="'Paste values'" />
			</div>
		</div-->
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Vec3 } from '@/script/types/primitives/Vec3';

@Component({ components: { DraggableNumberInput } })
export default class Vec3Control extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: Vec3;
	@Prop(Number) min: number;
	@Prop({ default: false }) hideLabel: boolean;

	onChangeValue(axis: string, val: number) {
		const newVal = this.value.clone();

		switch (axis) {
		case 'x':
			newVal.x = val;
			break;
		case 'y':
			newVal.y = val;
			break;
		case 'z':
			newVal.z = val;
		}

		this.$emit('input', newVal);
	}

	/*
	// TODO: Instead of localStorage we must use a state!
	onCopy() {
		localStorage.setItem('copy_' + this.label, JSON.stringify(this.value));
	}

	onPaste() {
		let copied: any = localStorage.getItem('copy_' + this.label);
		if (copied) {
			try {
				copied = JSON.parse(copied);
				const newVal = this.value.clone();
				newVal.x = copied.x;
				newVal.y = copied.y;
				newVal.z = copied.z;
				this.$emit('input', newVal);
			} catch (err: any) {
				console.error(err);
			}
		}
	}
	*/
}
</script>

<style lang="scss" scoped>
.Vec3Control {
	display: grid;
	// grid-template-columns: 50px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 40px;
	grid-template-columns: 50px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
	align-items: center;
	grid-gap: 5px;

	.vue-draggable-number-container {
		font-weight: 900;
		font-size: 14px;

		&::v-deep input {
			margin-left: 4px;
		}

		&.x {
			color: #ff2a2a;
		}

		&.y {
			color: #35ff68;
		}

		&.z {
			color: #037fff;
		}
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;

		.paste-btn,
		.copy-btn {
			display: inline-flex;
			width: 14px;
			height: 14px;
			background: #037fff;
			border-radius: 3px;
			padding: 3px;
		}

		.copy-btn {
			margin-right: 4px;
		}
	}

	span {
		font-size: 10px;
		text-transform: uppercase;
		font-weight: 600;
		color: #fff;
	}
}
</style>
