<template>
	<div class="transformControls">
		<div class="pos-control">
			<Vec3Control :hideLabel="hideLabel" :value="position" label="Position" :step=0.014 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</div>
		<div class="rot-control">
			<QuatControl :hideLabel="hideLabel" :value="rotation" label="Rotation" :step=0.14 @quatUpdated="quatUpdated" @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag" mode="Euler" />
		</div>
		<div class="scale-control">
			<Vec3Control :hideLabel="hideLabel" :value="scale" label="Scale" :min=0.01 @input="onChangeValue" :step=0.014 @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</div>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Emit } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import QuatControl from '@/script/components/controls/QuatControl.vue';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { IQuat, Quat } from '@/script/types/primitives/Quat';

@Component({ components: { DraggableNumberInput, Vec3Control, QuatControl } })
export default class InspectorComponent extends Vue {
	@Prop()
	position: IVec3;

	@Prop()
	rotation: IQuat;

	@Prop()
	scale: IVec3;

	@Prop({ default: false })
	hideLabel: boolean;

	@Emit('update:rotation')
	quadUpdate(newVal: IQuat) {
		return newVal;
	}

	onChangeValue() {
		this.$emit('input');
	}

	@Emit('quatUpdated')
	quatUpdated(newQuat: IQuat) {
		return newQuat;
	}

	@Emit('startDrag')
	onStartDrag(event: Event) {
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
	.transformControls {
		display: grid;
	}
	.transformControls::v-deep .Vec3Control {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.transformControls::v-deep b{
		grid-row: 1;
		font-weight: bold;
	}
	.transformControls::v-deep .x{
		grid-column: 1;
		grid-row: 2;
	}
	.transformControls::v-deep .y{
		grid-column: 2;
		grid-row: 2;
	}
	.transformControls::v-deep .z {
		grid-column: 3;
		grid-row: 2;
	}
	.transformControls::v-deep .w{
		grid-column: 4;
		grid-row: 2;
	}
	.transformControls::v-deep input {
		border: 0;
	}

	.pos-control, .rot-control, .scale-control {
		margin: 0.5vmin 0;
	}
</style>
