<template>
	<div class="Vec3Control">
		<b v-if="label">{{label}}</b>
		<DraggableNumberInput :hideLabel="hideLabel" class="x" dragDirection="X" v-model="value.x" label="X" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		<DraggableNumberInput :hideLabel="hideLabel" class="y" dragDirection="X" v-model="value.y" label="Y" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		<DraggableNumberInput :hideLabel="hideLabel" class="z" dragDirection="X" v-model="value.z" label="Z" :step=step :min=min @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Vector3 } from 'three';

@Component({ components: { DraggableNumberInput } })
export default class Vec3Control extends Vue {
	@Prop(String) label: string;
	@Prop({ default: 0.014 }) step: number;
	@Prop(Object) value: Vector3;
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
	.x, .y, .z {
		margin-top: 1vmin;
	}
</style>
