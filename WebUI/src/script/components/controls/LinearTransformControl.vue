<template>
	<div class="transformControls">
		<div class="pos-control">
			<Vec3Control :hideLabel="hideLabel" v-model="value.position" label="Position" :step=0.014 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</div>
		<div class="rot-control">
			<QuatControl :hideLabel="hideLabel" v-model="value.rotation" label="Rotation" :step=0.14 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag" mode="Euler" />
		</div>
		<div class="scale-control">
			<Vec3Control :hideLabel="hideLabel" v-model="value.scale" label="Scale" :min=0.01 :step=0.014 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		</div>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import QuatControl from '@/script/components/controls/QuatControl.vue';

@Component({ components: { DraggableNumberInput, Vec3Control, QuatControl } })
export default class InspectorComponent extends Vue {
	@Prop(LinearTransform) value: LinearTransform;
	@Prop({ default: false }) hideLabel: boolean;

	onChangeValue() {
		this.$emit('input', this.value);
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
