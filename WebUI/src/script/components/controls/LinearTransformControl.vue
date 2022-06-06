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
