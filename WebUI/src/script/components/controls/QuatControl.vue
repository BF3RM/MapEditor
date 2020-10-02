<template>
	<div>
		<b>{{label}}</b>
		<template v-if="mode === 'Vec4'">
			<DraggableNumberInput :hideLabel="hideLabel" class="x" dragDirection="X" v-model="value.x" label="X" @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="y" dragDirection="X" v-model="value.y" label="Y" @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="z" dragDirection="X" v-model="value.z" label="Z" @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="w" dragDirection="X" v-model="value.w" label="W" @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</template>
		<template v-else>
			<Vec3Control :hideLabel="hideLabel" :value="euler" label="" @input="onChangeValue" :step=step @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</template>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { IQuat, Quat } from '@/script/types/primitives/Quat';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { Euler } from 'three';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import { MathUtils } from 'three/src/math/MathUtils';
import RAD2DEG = MathUtils.RAD2DEG;
import DEG2RAD = MathUtils.DEG2RAD;

@Component({ components: { DraggableNumberInput, Vec3Control } })
export default class QuatControl extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: IQuat;
	@Prop({ default: 'Vec4' }) mode: string;
	@Prop({ default: false }) hideLabel: boolean;

	private euler: IVec3 = new Vec3().toTable();

	@Emit('startDrag')
	onStartDrag(event: Event) {
		return event;
	}

	@Emit('endDrag')
	onEndDrag(event: Event) {
		return event;
	}

	@Watch('value')
	onValueChange(newValue: IQuat) {
		const newEuler = new Euler().setFromQuaternion(Quat.setFromTable(newValue));
		this.euler = new Vec3(newEuler.x * RAD2DEG, newEuler.y * RAD2DEG, newEuler.z * RAD2DEG).toTable();
	}

	@Emit('input')
	onChangeValue() {
		if (this.mode !== 'Vec4') {
			const newQuat = new Quat().setFromEuler(new Euler(this.euler.x * DEG2RAD, this.euler.y * DEG2RAD, this.euler.z * DEG2RAD));
			const a = (newQuat as Quat).toTable();
			this.$emit('quat-updated', a);
		}
	}
}
</script>

<style lang="scss" scoped>
</style>
