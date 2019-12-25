<template>
	<gl-component>
		<div v-if="gameObject">
			<div class="header">
				<label for="enabled">Enabled:</label><input type="checkbox" id="enabled" ref="enabled" v-model="gameObject.enabled" @change="onEnableChange">
				<label for="name">Name:</label><input :value="gameObject.name" @input="onNameChange" id="name">
				<LinearTransformControl v-model="transform" @input="onChange"></LinearTransformControl>
			</div>
		</div>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop, PropSync } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';

@Component({ components: { LinearTransformControl } })
export default class InspectorComponent extends EditorComponent {
	private gameObject: GameObject | null = null;

	private transform: LinearTransform = new LinearTransform();

	private position: Vector3;
	private rotation: Vector3;
	private scale: Vector3;

	constructor() {
		super();
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
		signals.objectChanged.connect(this.onObjectChanged.bind(this));
	}

	private onChange(e: LinearTransform) {
		(window as any).editor.selectionGroup.setTransform(e, true);
		window.editor.threeManager.Render();
	}

	private onObjectChanged(guid: Guid) {
		this.transform = this.gameObject.transform.clone();
	}

	private onSelectedGameObject(guid: Guid) {
		const go = window.editor.getGameObjectByGuid(guid);
		if (go) {
			this.gameObject = go;
			this.transform = go.transform.clone();
		}
	}

	private onEnableChange(e: Event) {
		(this.$refs.enabled as any).checked = this.gameObject!.enabled;
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
