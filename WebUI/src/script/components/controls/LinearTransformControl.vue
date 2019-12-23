<template>
	<div>
		<span>Pos</span>
		<DraggableNumberInput dragDirection="X" v-model="value.elements[12]" label="X" :step=0.014 @input="onValueChange"></DraggableNumberInput>
		<DraggableNumberInput dragDirection="X" v-model="value.elements[13]" label="Y" :step=0.014 @input="onValueChange"></DraggableNumberInput>
		<DraggableNumberInput dragDirection="X" v-model="value.elements[14]" label="Z" :step=0.014 @input="onValueChange"></DraggableNumberInput>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Matrix4 } from 'three';

@Component({ components: { DraggableNumberInput } })
export default class InspectorComponent extends Vue {
	@Prop(Matrix4) value: Matrix4;
	@Emit('input')
	onValueChange(a: any, b:any) {
		return this.value;
	}
}
</script>

<style scoped>

</style>
