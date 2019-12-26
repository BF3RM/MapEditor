<template>
	<div>
		<Vec3Control v-model="value.position" label="Pos" :step=0.014 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		<QuatControl v-model="value.rotation" label="Rot" :step=0.14 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag" mode="Euler" />
		<Vec3Control v-model="value.scale" label="Scale" :step=0.014 @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
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

	onChangeValue() {
		this.$emit('input', this.value);
	}

	onStartDrag() {
		this.$emit('startDrag');
		return true;
	}

	onEndDrag() {
		this.onChangeValue();
		this.$emit('endDrag');
		return true;
	}

	onValueChange() {
	}
}
</script>

<style scoped>

</style>
