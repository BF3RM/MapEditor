<template>
	<div>
		<b>{{label}}</b>
		<div v-if="mode === 'Vec4'">
			<DraggableNumberInput dragDirection="X" v-model="value.x" label="X" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput dragDirection="X" v-model="value.y" label="Y" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput dragDirection="X" v-model="value.z" label="Z" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput dragDirection="X" v-model="value.w" label="W" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</div>
		<div v-else>
			<DraggableNumberInput dragDirection="X" v-model="euler.x" label="X" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput dragDirection="X" v-model="euler.y" label="Y" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput dragDirection="X" v-model="euler.z" label="Z" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</div>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Euler, Quaternion } from 'three';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import { _Math } from 'three/src/math/Math';
import RAD2DEG = _Math.RAD2DEG;
import DEG2RAD = _Math.DEG2RAD;

@Component({ components: { DraggableNumberInput } })
export default class QuatControl extends Vec3Control {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop(Object) value: Quaternion;
	@Prop({ default: 'Vec4' }) mode: string;

	private euler = new Euler().setFromQuaternion(this.value);

	@Watch('value')
	onValueChange(newValue: Quaternion) {
		const euler = new Euler().setFromQuaternion(newValue);
		this.euler = new Euler(euler.x * RAD2DEG, euler.y * RAD2DEG, euler.z * RAD2DEG);
	}

	onChangeValue() {
		console.log(this.value);
		if (this.mode === 'Vec4') {
			this.$emit('input', this.value);
		} else {
			this.value = this.value.setFromEuler(new Euler(this.euler.x * DEG2RAD, this.euler.y * DEG2RAD, this.euler.z * DEG2RAD));
			this.$emit('input', this.value);
		}
	}
}
</script>

<style scoped>

</style>
