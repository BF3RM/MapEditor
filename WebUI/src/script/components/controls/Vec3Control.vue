<template>
	<div class="Vec3Control">
		<div class="label">
			<b v-if="label">{{label}}</b>
		</div>
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="hideLabel" class="x" dragDirection="X" :value="value.x" label="X" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag" type="Float"/>
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="hideLabel" class="y" dragDirection="X" :value="value.y" label="Y" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag" type="Float"/>
		<DraggableNumberInput @blur="$emit('blur')" :hideLabel="hideLabel" class="z" dragDirection="X" :value="value.z" label="Z" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag" type="Float"/>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Vector3 } from 'three';
import { IVec3 } from '@/script/types/primitives/Vec3';

@Component({ components: { DraggableNumberInput } })
export default class Vec3Control extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: IVec3;
	@Prop(Number) min: number;
	@Prop({ default: false }) hideLabel: boolean;

	onChangeValue() {
		this.$emit('input', this.value);
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
.Vec3Control {
	display: flex;
}
</style>
