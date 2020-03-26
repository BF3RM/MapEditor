<template>
	<gl-component class="inspector-component">
		<div v-if="gameObject">
			<div class="header">
				<div class="enable-container">
					<label class="enable-label" for="enabled">Enabled:</label>
					<input class="enable-input" type="checkbox" id="enabled" ref="enabled" v-model="gameObject.enabled" @change="onEnableChange">
				</div>
				<div>
					<label class="name-label" for="name">Name:</label><input class="name-input" :value="gameObject.name" @input="onNameChange" id="name">
					<linear-transform-control class="lt-control" :hideLabel="false" v-model="transform" @input="onInput" @startDrag="onStartDrag" @endDrag="onEndDrag "/>
				</div>
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
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { LOGLEVEL } from '@/script/modules/Logger';

@Component({ components: { LinearTransformControl } })
export default class InspectorComponent extends EditorComponent {
	private gameObject: GameObject | null = null;
	private transform: LinearTransform = new LinearTransform();
	private dragging = false;

	@Ref('enabled')
	enabled!: HTMLInputElement;

	constructor() {
		super();
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
		signals.objectChanged.connect(this.onObjectChanged.bind(this));
	}

	private onInput(e: LinearTransform) {
		if (this.gameObject !== null) {
			this.gameObject.setTransform(e);
			window.editor.threeManager.setPendingRender();
		}
	}

	onStartDrag() {
		this.dragging = true;
	}

	onEndDrag() {
		console.log('Drag end');
		if (this.gameObject) {
			this.gameObject.onMoveEnd(true);
			this.dragging = false;
		}
	}

	private onObjectChanged(gameObject: GameObject) {
		if (this.gameObject !== null && gameObject === this.gameObject && !this.dragging) {
			this.transform = new LinearTransform().setFromMatrix(gameObject.matrix);
		}
	}

	private onSelectedGameObject(guid: Guid) {
		const go = window.editor.getGameObjectByGuid(guid);
		if (go) {
			this.gameObject = go;
			this.transform = go.transform;
		}
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
<style lang="scss" scoped>
	.transformControls::v-deep input {
		width: 100%;
		max-width: 100%;
	}
	.inspector-component {
		margin: 1vmin;

		.enable-container {
			display: flex;
			flex-direction: row;
			align-content: center;
			.enable-label {
				margin: 1vmin 0;
				font-weight: bold;
			}

			.enable-input {
				height: 1.5vmin;
				margin: 1vmin 0;
			}

		}

		.name-label {
			margin: 1vmin 0;
			font-weight: bold;
		}

		.name-input {
			margin: 1vmin 0;
		}
	}
</style>
