<template>
	<div>
		<span>Pos</span>
		<DraggableNumberInput dragDirection="X" v-model="pos.x" label="X" :step=0.014 @input="onValueChange"/>
		<DraggableNumberInput dragDirection="X" v-model="pos.y" label="Y" :step=0.014 @input="onValueChange"/>
		<DraggableNumberInput dragDirection="X" v-model="pos.z" label="Z" :step=0.014 @input="onValueChange"/>

		<span>Rot</span>
		<DraggableNumberInput dragDirection="X" v-model="rotation.x" label="X" :step=0.014 @input="onValueChange"/>
		<DraggableNumberInput dragDirection="X" v-model="rotation.y" label="Y" :step=0.014 @input="onValueChange"/>
		<DraggableNumberInput dragDirection="X" v-model="rotation.z" label="Z" :step=0.014 @input="onValueChange"/>

		<span>Scale</span>
		<DraggableNumberInput dragDirection="X" v-model="scale.x" label="X" :step=0.014 @input="onValueChange"/>
		<DraggableNumberInput dragDirection="X" v-model="scale.y" label="Y" :step=0.014 @input="onValueChange"/>
		<DraggableNumberInput dragDirection="X" v-model="scale.z" label="Z" :step=0.014 @input="onValueChange"/>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch, Emit } from 'vue-property-decorator';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

@Component({ components: { DraggableNumberInput } })
export default class InspectorComponent extends Vue {
	@Prop(Matrix4) value: Matrix4;
	private pos: Vector3 = new Vector3();
	private rotation: Euler = new Euler();
	private scale: Vector3 = new Vector3();

	@Watch('value')
	onChangeValue(type: string) {
		console.log('Changed value:' + type);
		const rot = new Quaternion();
		this.value.decompose(this.pos, rot, this.scale);
		this.rotation = new Euler().setFromQuaternion(rot);
	}

	onChangeTransforms(type: string) {
		console.log(type);
	}

	@Watch('pos', { deep: true })
	onChangePosition(a: Vector3, b: Vector3) {
		this.value.setPosition(a);
	}

	@Watch('rotation', { deep: true })
	onChangeRotation(a: Euler, b: Euler) {
		this.value.makeRotationFromEuler(a);
	}

	@Watch('scale', { deep: true })
	onChangeScale(a: Vector3, b: Vector3) {
		console.log('Changed scale');
	}

	@Emit('input')
	onValueChange() {
		return this.value;
	}
}
</script>

<style scoped>

</style>
