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
				:value="value.x"
				label="X"
				@input="onChangeValue('x', $event)"
			/>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="y"
				dragDirection="X"
				:value="value.y"
				label="Y"
				@input="onChangeValue('y', $event)"
			/>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="z"
				dragDirection="X"
				:value="value.z"
				label="Z"
				@input="onChangeValue('z', $event)"
			/>
			<DraggableNumberInput
				:hideLabel="hideLabel"
				class="w"
				dragDirection="X"
				:value="value.w"
				label="W"
				@input="onChangeValue('w', $event)"
			/>
		</template>
		<template v-else>
			<Vec3Control
				:value="euler"
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
import { defineComponent } from '@vue/composition-api';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Quat } from '@/script/types/primitives/Quat';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Euler, MathUtils } from 'three';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import RAD2DEG = MathUtils.RAD2DEG;
import DEG2RAD = MathUtils.DEG2RAD;

export default defineComponent({
	name: 'QuatControl',
	components: {
		DraggableNumberInput,
		Vec3Control
	},
	props: {
		label: {
			type: String,
			required: false
		},
		step: {
			type: Number,
			default: 0.014
		},
		value: {
			type: Quat,
			required: true
		},
		mode: {
			type: String,
			default: 'Vec4'
		},
		hideLabel: {
			type: Boolean,
			default: false
		}
	},
	computed: {
		euler(): Vec3 {
			const newEuler = new Euler().setFromQuaternion(this.value);
			return new Vec3(newEuler.x * RAD2DEG, newEuler.y * RAD2DEG, newEuler.z * RAD2DEG);
		}
	},
	methods: {
		onChangeEuler(newEulerVec3: Vec3) {
			const newVal = new Quat().setFromEuler(
				new Euler(newEulerVec3.x * DEG2RAD, newEulerVec3.y * DEG2RAD, newEulerVec3.z * DEG2RAD)
			);
			this.$emit('input', newVal);
		},
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
});
</script>
