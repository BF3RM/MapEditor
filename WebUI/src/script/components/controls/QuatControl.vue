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

@Component({ components: { DraggableNumberInput } })
export default class QuatControl extends Vec3Control {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop(Object) value: Quaternion;
	@Prop({ default: 'Vec4' }) mode: string;

	private euler = new Euler().setFromQuaternion(this.value);

	onChangeValue() {
		console.log(this.value);
		if (this.mode === 'Vec4') {
			this.$emit('input', this.value);
		} else {
			this.value = this.value.setFromEuler(this.euler);
			this.$emit('input', this.value);
		}
	}
}
</script>

<style scoped>

</style>
