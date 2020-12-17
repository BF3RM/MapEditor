<template>
	<div>
		<template v-if="mode === 'Vec4'">
			<div class="label">
				<b v-if="label">{{label}}</b>
			</div>
			<DraggableNumberInput :hideLabel="hideLabel" class="x" dragDirection="X" v-model="value.x" label="X" @input="onChangeValue('x', $event)"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="y" dragDirection="X" v-model="value.y" label="Y" @input="onChangeValue('y', $event)"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="z" dragDirection="X" v-model="value.z" label="Z" @input="onChangeValue('z', $event)"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="w" dragDirection="X" v-model="value.w" label="W" @input="onChangeValue('w', $event)"/>
		</template>
		<template v-else>
			<Vec3Control :hideLabel="hideLabel" :value="euler" :label="label" @input="onChangeEuler" :step="step"/>
		</template>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Quat } from '@/script/types/primitives/Quat';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Euler } from 'three';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import { MathUtils } from 'three/src/math/MathUtils';
import RAD2DEG = MathUtils.RAD2DEG;
import DEG2RAD = MathUtils.DEG2RAD;

@Component({ components: { DraggableNumberInput, Vec3Control } })
export default class QuatControl extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: Quat;
	@Prop({ default: 'Vec4' }) mode: string;
	@Prop({ default: false }) hideLabel: boolean;

	private euler: Vec3 = new Vec3();

	@Watch('value')
	onValueChange(newValue: Quat) {
		const newEuler = new Euler().setFromQuaternion(newValue);
		this.euler = new Vec3(newEuler.x * RAD2DEG, newEuler.y * RAD2DEG, newEuler.z * RAD2DEG);
	}

	onChangeEuler(newEulerVec3: Vec3) {
		const newVal = new Quat().setFromEuler(new Euler(newEulerVec3.x * DEG2RAD, newEulerVec3.y * DEG2RAD, newEulerVec3.z * DEG2RAD));
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

<style lang="scss" scoped>
</style>
