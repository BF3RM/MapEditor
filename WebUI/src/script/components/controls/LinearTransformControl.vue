<template>
	<div class="transformControls" v-if="value">
		<div class="pos-control">
			<Vec3Control
					label="Position"
					:hideLabel="hideLabel"
					:value="value.position"
					:step=0.014
					@input="onChangePosition"
					@blur="$emit('blur')"
					@dragstart="$emit('dragstart')"
					@dragend="$emit('dragend')" />
		</div>
		<div class="rot-control">
			<QuatControl
					label="Rotation"
					mode="Euler"
					:hideLabel="hideLabel"
					:value="value.rotation"
					:step=0.14
					@input="onChangeRotation"
					@blur="$emit('blur')"
					@dragstart="$emit('dragstart')"
					@dragend="$emit('dragend')" />
		</div>
		<div class="scale-control">
			<Vec3Control
					label="Scale"
					:hideLabel="hideLabel"
					:value="value.scale"
					:min=0.01
					:step=0.014
					@input="onChangeScale"
					@blur="$emit('blur')"
					@dragstart="$emit('dragstart')"
					@dragend="$emit('dragend')" />
		</div>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import QuatControl from '@/script/components/controls/QuatControl.vue';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Quat } from '@/script/types/primitives/Quat';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';

@Component({ components: { DraggableNumberInput, Vec3Control, QuatControl } })
export default class LinearTransformControl extends Vue {
	@Prop()
	value: LinearTransform;

	@Prop({ default: false })
	hideLabel: boolean;

	@Prop({ default: null })
	parentTransform: LinearTransform;

	onChangePosition(newPos: Vec3) {
		const newVal = this.value.clone();
		newVal.position = newPos;

		this.$emit('input', newVal);
	}

	onChangeScale(newScale: Vec3) {
		const newVal = this.value.clone();
		newVal.scale = newScale;

		this.$emit('input', newVal);
	}

	onChangeRotation(newRotation: Quat) {
		const newVal = this.value.clone();
		newVal.rotation = newRotation;
		this.$emit('input', newVal);
	}
}
</script>

<style lang="scss" scoped>
	.transformControls {
		display: grid;
		padding: 10px;
	}
	.transformControls::v-deep .Vec3Control {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}
	.transformControls::v-deep .label{
		grid-column: 1;
		font-weight: bold;
	}
	.transformControls::v-deep .x{
		grid-column: 2;
	}
	.transformControls::v-deep .y{
		grid-column: 3;
	}
	.transformControls::v-deep .z {
		grid-column: 4;
	}
	.transformControls::v-deep .w{
		grid-column: 5;
	}
	.transformControls::v-deep input {
		border: 0;
	}

</style>
