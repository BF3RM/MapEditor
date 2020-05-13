<template>
	<gl-component class="inspector-component">
		<div v-if="!isEmpty">
			<div class="header">
				<div class="enable-container">
					<label class="enable-label" for="enabled">Enabled:</label>
					<input class="enable-input" type="checkbox" id="enabled" :disabled="multiSelection" ref="enableInput" v-model="enabled" @change="onEnableChange">
				</div>
				<div class="transform-container">
					<label class="name-label" for="name">Name:</label><input class="name-input" :value="displayName" :disabled="multiSelection" @input="onNameChange" id="name">
					<linear-transform-control class="lt-control" :hideLabel="false" v-model="transform" @input="onInput" @startDrag="onStartDrag" @endDrag="onEndDrag "/>
				</div>
			</div>
		</div>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop, PropSync, Ref } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { LOGLEVEL } from '@/script/modules/Logger';
import { SelectionGroup } from '@/script/types/SelectionGroup';

@Component({ components: { LinearTransformControl } })
export default class InspectorComponent extends EditorComponent {
	private group: SelectionGroup | null = null;
	private transform: LinearTransform = new LinearTransform();
	private dragging = false;
	private enabled = true;

	@Ref('enableInput')
	enableInput!: HTMLInputElement;

	constructor() {
		super();
		signals.selectionGroupChanged.connect(this.onSelectionGroupChanged.bind(this));
	}

	private onInput(linearTransform: LinearTransform) {
		console.log('oninput');
		if (this.group !== null) {
			// Move selection group to the new position.
			const matrix = linearTransform.toMatrix();
			matrix.decompose(this.group.position, this.group.quaternion, this.group.scale);
			this.group.updateMatrix();
			// Update inspector transform.
			this.transform = linearTransform;
			// Update children.
			this.group.updateSelectedGameObjects();
			window.editor.threeManager.setPendingRender();
		}
	}

	get isEmpty() {
		if (this.group) {
			return (this.group.selectedGameObjects.length === 0);
		}
		return true;
	}

	get multiSelection() {
		if (this.group) {
			return (this.group.selectedGameObjects.length > 1);
		}
		return false;
	}

	get displayName() {
		if (!this.group || this.isEmpty) {
			return '';
		}
		if (this.multiSelection) {
			return 'Multiselection';
		} else {
			return this.group.selectedGameObjects[0].name;
		}
	}

	onStartDrag() {
		this.dragging = true;
	}

	onEndDrag() {
		console.log('Drag end');

		if (this.group) {
			this.group.onClientOnlyMoveEnd();
			this.dragging = false;
		}
	}

	private onSelectionGroupChanged(group: SelectionGroup) {
		if (!this.group) {
			this.group = group;
		}
		if (!this.dragging) {
			// Update inspector transform.
			this.transform = this.group.transform;
		}
	}

	private onEnableChange(e: Event) {	// TODO Fool: Enabling and disabling should work for multi-selection too.
		// this.enableInput.checked = this.group.enabled;
	}

	private onNameChange(e: InputEvent) {
		if (!this.group || this.isEmpty) {
			return;
		}
		if ((e.target as any).value) {
			window.editor.execute(new SetObjectNameCommand(this.group.selectedGameObjects[0].getGameObjectTransferData(), (e.target as any).value));
		}
	}
}
</script>
<style lang="scss" scoped>
	.transformControls::v-deep input {
		width: 100%;
	}
	.inspector-component {
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
			border-radius: 0.1vmin;
		}
	}
</style>
