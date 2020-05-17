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
					<linear-transform-control class="lt-control" :hideLabel="false"
											:position="position" :rotation="rotation" :scale="scale"
											@input="onInput" @startDrag="onStartDrag" @endDrag="onEndDrag" @quatUpdated="quatUpdated"/>
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
import { ILinearTransform, LinearTransform } from '@/script/types/primitives/LinearTransform';
import { LOGLEVEL } from '@/script/modules/Logger';
import { SelectionGroup } from '@/script/types/SelectionGroup';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { IQuat, Quat } from '@/script/types/primitives/Quat';

@Component({ components: { LinearTransformControl } })
export default class InspectorComponent extends EditorComponent {
	private group: SelectionGroup | null = null;
	private position: IVec3 = new Vec3().toTable();
	private scale: IVec3 = new Vec3(1, 1, 1).toTable();
	private rotation: IQuat = new Quat().toTable();
	private dragging = false;
	private enabled = true;

	@Ref('enableInput')
	enableInput!: HTMLInputElement;

	constructor() {
		super();
		signals.selectionGroupChanged.connect(this.onSelectionGroupChanged.bind(this));
	}

	private onInput() {
		if (this.group !== null) {
			// Move selection group to the new position.
			this.group.position.set(this.position.x, this.position.y, this.position.z);
			this.group.scale.set(this.scale.x, this.scale.y, this.scale.z);
			this.group.rotation.setFromQuaternion(Quat.setFromTable(this.rotation));

			this.group.updateMatrix();
			// Update inspector transform.
			window.editor.threeManager.nextFrame(() => {
				if (this.group) {
					this.group.onClientOnlyMove();
				}
				window.editor.threeManager.setPendingRender();
			});
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
		// console.log('Drag start');
		this.dragging = true;
	}

	onEndDrag() {
		// console.log('Drag end');
		if (this.group) {
			this.group.onClientOnlyMoveEnd();
			this.dragging = false;
		}
	}

	private quatUpdated(newQuat: IQuat) {
		this.rotation = newQuat;
	}

	private onSelectionGroupChanged(group: SelectionGroup) {
		if (!this.group) {
			this.group = group;
		}
		if (!this.dragging) {
			// Update inspector transform.
			this.position = this.group.transform.trans.toTable();
			this.scale = this.group.transform.scale.toTable();
			this.rotation = this.group.transform.rotation.toTable();
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
