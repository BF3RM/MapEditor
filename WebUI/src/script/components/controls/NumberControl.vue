<template>
	<div class="NumberControl">
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="true" dragDirection="X" v-model="value" label="X" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Vector3 } from 'three';
import { IVec3 } from '@/script/types/primitives/Vec3';

@Component({ components: { DraggableNumberInput } })
export default class NumberControl extends Vue {
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: IVec3;
	@Prop(Number) min: number;

	onChangeValue() {
		this.$emit('input');
	}

	@Emit('startDrag')
	onStartDrag(event: Event) {
		this.onChangeValue();
		return event;
	}

	@Emit('endDrag')
	onEndDrag(event: Event) {
		this.onChangeValue();
		return event;
	}
}
</script>

<style lang="scss" scoped>
</style>
