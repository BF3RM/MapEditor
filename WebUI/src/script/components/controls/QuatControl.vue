<template>
	<div>
		<b>{{label}}</b>
		<template v-if="mode === 'Vec4'">
			<DraggableNumberInput :hideLabel="hideLabel" class="x" dragDirection="X" v-model="value.x" label="X" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="y" dragDirection="X" v-model="value.y" label="Y" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="z" dragDirection="X" v-model="value.z" label="Z" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
			<DraggableNumberInput :hideLabel="hideLabel" class="w" dragDirection="X" v-model="value.w" label="W" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</template>
		<template v-else>
			<Vec3Control :hideLabel="hideLabel" v-model="euler" label="" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</template>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Euler, Quaternion } from 'three';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import { MathUtils } from 'three/src/math/MathUtils';
import RAD2DEG = MathUtils.RAD2DEG;
import DEG2RAD = MathUtils.DEG2RAD;

@Component({ components: { DraggableNumberInput, Vec3Control } })
export default class QuatControl extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop(Object) value: Quaternion;
	@Prop({ default: 'Vec4' }) mode: string;
	@Prop({ default: false }) hideLabel: boolean;

	@Emit('startDrag')
	onStartDrag(event: Event) {
		return event;
	}

	@Emit('endDrag')
	onEndDrag(event: Event) {
		return event;
	}

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
