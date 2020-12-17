<template>
	<div class="Vec3Control">
		<div class="label">
			<b v-if="label">{{label}}</b>
		</div>
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="hideLabel" class="x" dragDirection="X" :value="value.x" label="X" :step=step :min=min @input="onChangeValue('x', $event)" type="Float"/>
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="hideLabel" class="y" dragDirection="X" :value="value.y" label="Y" :step=step :min=min @input="onChangeValue('y', $event)" type="Float"/>
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="hideLabel" class="z" dragDirection="X" :value="value.z" label="Z" :step=step :min=min @input="onChangeValue('z', $event)" type="Float"/>
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
}
</script>

<style lang="scss" scoped>
.Vec3Control {
	display: flex;
}
</style>
