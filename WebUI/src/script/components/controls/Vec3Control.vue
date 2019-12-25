<template>
	<div>
		<b>{{label}}</b>
		<DraggableNumberInput dragDirection="X" v-model="value.x" label="X" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		<DraggableNumberInput dragDirection="X" v-model="value.y" label="Y" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
		<DraggableNumberInput dragDirection="X" v-model="value.z" label="Z" :step=step @input="onChangeValue" @startDrag="onStartDrag" @endDrag="onEndDrag"/>
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

	onChangeValue() {
		console.log(this.value);
		this.$emit('input', this.value);
	}

	onStartDrag() {
		this.onChangeValue();
		this.$emit('startDrag');
	}

	onEndDrag() {
		this.onChangeValue();
		this.$emit('endDrag');
	}
}
</script>

<style scoped>

</style>
