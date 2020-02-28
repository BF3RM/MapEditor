<template>
	<gl-component>
		<div v-if="gameObject">
			<div class="header">
				<label for="enabled">Enabled:</label><input type="checkbox" id="enabled" ref="enabled" v-model="gameObject.enabled" @change="onEnableChange">
				<label for="name">Name:</label><input :value="gameObject.name" @input="onNameChange" id="name">
				<LinearTransformControl v-model="gameObject.matrixWorld" @input="onChange"></LinearTransformControl>
			</div>
		</div>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop, PropSync, Ref } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

@Component({ components: { LinearTransformControl } })
export default class InspectorComponent extends EditorComponent {
	private gameObject: GameObject | null = null;

	@Ref('enabled')
	enabled!: HTMLInputElement;

	private position: Vector3;
	private rotation: Vector3;
	private scale: Vector3;

	constructor() {
		super();
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
		signals.objectChanged.connect(this.onObjectChanged.bind(this));
		this.gameObject = window.editor.selectionGroup;
	}

	private onChange(e: Matrix4) {
		console.log(e);
		const pos = new Vector3();
		const rot = new Quaternion();
		const scale = new Vector3();
		e.decompose(pos, rot, scale);
		const eulerRot = new Euler().setFromQuaternion(rot);
		this.gameObject!.position.set(pos.x, pos.y, pos.z);
		this.gameObject!.rotation.set(eulerRot.x, eulerRot.y, eulerRot.z);
		this.gameObject!.scale.set(scale.x, scale.y, scale.z);
		window.editor.threeManager.Render();
	}

	private onObjectChanged(guid: Guid) {
		this.$forceUpdate();
	}

	private onSelectedGameObject(guid: Guid) {
		// const go = window.editor.getGameObjectByGuid(guid);
		// if (go) {
		//	this.gameObject = go;
		// }
	}

	private onEnableChange(e: Event) {
		this.enabled.checked = this.gameObject!.enabled;
	}

	private onNameChange(e: InputEvent) {
		if ((e.target as any).value) {
			window.editor.execute(new SetObjectNameCommand(this.gameObject!.getGameObjectTransferData(), (e.target as any).value));
		}
	}
}
</script>
<style scoped>
	input {
		width: 100%;
	}
</style>
