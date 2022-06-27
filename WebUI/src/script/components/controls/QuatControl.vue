<template>
	<div>
		<template v-if="mode === 'Vec4'">
			<div class="label">
				<b v-if="label">{{ label }}</b>
			</div>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="x"
				dragDirection="X"
				v-model="value.x"
				label="X"
				@input="onChangeValue('x', $event)"
			/>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="y"
				dragDirection="X"
				v-model="value.y"
				label="Y"
				@input="onChangeValue('y', $event)"
			/>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="z"
				dragDirection="X"
				v-model="value.z"
				label="Z"
				@input="onChangeValue('z', $event)"
			/>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="w"
				dragDirection="X"
				v-model="value.w"
				label="W"
				@input="onChangeValue('w', $event)"
			/>
		</template>
		<template v-else>
			<Vec3Control
				v-model="euler"
				:hideLabel="hideLabel"
				:label="label"
				:step="step"
				@input="onChangeEuler"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')"
			/>
		</template>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Quat } from '@/script/types/primitives/Quat';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Euler, MathUtils } from 'three';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import RAD2DEG = MathUtils.RAD2DEG;
import DEG2RAD = MathUtils.DEG2RAD;

@Component({ components: { DraggableNumberInput, Vec3Control } })
export default class QuatControl extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: Quat;
	@Prop({ default: 'Vec4' }) mode: string;
	@Prop({ default: false }) hideLabel: boolean;

	get euler(): Vec3 {
		const newEuler = new Euler().setFromQuaternion(this.value);
		return new Vec3(newEuler.x * RAD2DEG, newEuler.y * RAD2DEG, newEuler.z * RAD2DEG);
	}

	set euler(newEulerVec3: Vec3) {
		this.value.setFromEuler(
			new Euler(newEulerVec3.x * DEG2RAD, newEulerVec3.y * DEG2RAD, newEulerVec3.z * DEG2RAD)
		);
	}

	onChangeEuler(newEulerVec3: Vec3) {
		const newVal = new Quat().setFromEuler(
			new Euler(newEulerVec3.x * DEG2RAD, newEulerVec3.y * DEG2RAD, newEulerVec3.z * DEG2RAD)
		);
		this.$emit('input', newVal);
	}

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
				break;
			case 'w':
				newVal.w = val;
		}

		this.$emit('input', newVal);
	}
}
</script>

<style lang="scss" scoped></style>
