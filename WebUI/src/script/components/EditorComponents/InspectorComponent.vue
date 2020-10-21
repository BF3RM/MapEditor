<template>
	<EditorComponent class="inspector-component" title="Inspector">
		<div v-if="!isEmpty">
			<div class="header">
				<img :class="'Large Icon Icon-' + objectType"/><input class="enable-input" type="checkbox" id="enabled" :disabled="multiSelection" ref="enableInput" v-model="enabled" @change="onEnableChange"><input class="name-input" :value="displayName" :disabled="multiSelection" @input="onNameChange" id="name">
			</div>
			<div class="transform-container">
				<label class="name-label" for="name">GUID:</label><input class="guid-input" :value="gameObjectName" :disabled="true">

				<linear-transform-control class="lt-control" :hideLabel="false"
										:position="position" :rotation="rotation" :scale="scale"
										@input="onInput" @startDrag="onStartDrag" @endDrag="onEndDrag" @quatUpdated="quatUpdated" @blur="onEndDrag"/>
			</div>
			<div class="blueprint-container" v-if="!multiSelection && !isEmpty">
				<div class="title">Blueprint</div>
				<label class="name-label" for="bp-name">Name:</label>
				<input class="name-input" id="bp-name" disabled="true" :value="blueprintName">

				<label class="name-label" for="bp-type">Type:</label>
				<input class="name-input" id="bp-type" disabled="true" :value="blueprintType">

				<label class="name-label" for="bp-instance-guid">Instance GUID:</label>
				<input class="name-input" id="bp-instance-guid" disabled="true" :value="blueprintGuid">

				<label class="name-label" for="bp-partition-guid">Partition GUID:</label>
				<input class="name-input" id="bp-partition-guid" disabled="true" :value="blueprintPartitionGuid">

				<el-select v-model="selectedVariation" size="mini" @change="onChangeVariation">
					<el-option v-for="variation of blueprintVariations" :key="variation.hash" :label="variation.name" :value="variation.hash"/>
				</el-select>
			</div>
		</div>
	</EditorComponent>
</template>

<script lang="ts">
import { Component, Ref } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import { SelectionGroup } from '@/script/types/SelectionGroup';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { IQuat, Quat } from '@/script/types/primitives/Quat';
import { GameObject } from '@/script/types/GameObject';
import SetVariationCommand from '@/script/commands/SetVariationCommand';

@Component({ components: { LinearTransformControl, EditorComponent } })
export default class InspectorComponent extends EditorComponent {
	private position: IVec3 = new Vec3().toTable();
	private scale: IVec3 = new Vec3(1, 1, 1).toTable();
	private rotation: IQuat = new Quat().toTable();
	private dragging = false;
	private enabled = true;
	private gameObjectGuid: string = '';
	private gameObjectName: string = '';
	private blueprintName: string = '';
	private blueprintType: string = '';
	private blueprintGuid: string = '';
	private blueprintPartitionGuid: string = '';
	private blueprintVariations: {hash: number, name: string}[] = [];
	private selectedVariation = 0;
	private objectType = '';
	private nOfObjectsInGroup = 0;

	@Ref('enableInput')
	enableInput!: HTMLInputElement;

	constructor() {
		super();
		signals.selectionGroupChanged.connect(this.onSelectionGroupChanged.bind(this));
		signals.selectedGameObject.connect(this.onSelection.bind(this));
		signals.deselectedGameObject.connect(this.onSelection.bind(this));
		signals.objectChanged.connect(this.onObjectChanged.bind(this));
	}

	private onObjectChanged(gameObject: GameObject, field: string, value: any) {
		if (!gameObject) {
			return;
		}
		if (field === 'enabled' && gameObject.selected && this.nOfObjectsInGroup === 1) {
			this.enabled = value;
		}
	}

	private onChangeVariation(newVariation: number) {
		console.log(newVariation);
		if (window.editor.selectionGroup.selectedGameObjects.length !== 1) {
			return;
		}
		const command = new SetVariationCommand(window.editor.selectionGroup.selectedGameObjects[0].getGameObjectTransferData(), newVariation);
		window.editor.execute(command);
	}

	// Why is this called twice?
	private onInput() {
		const group = window.editor.selectionGroup;
		if (group !== null) {
			// Move selection group to the new position.
			group.position.set(this.position.x, this.position.y, this.position.z);
			group.scale.set(this.scale.x, this.scale.y, this.scale.z);
			group.rotation.setFromQuaternion(Quat.setFromTable(this.rotation));
			group.updateMatrix();
			group.onClientOnlyMove();
			window.editor.threeManager.setPendingRender();
		}
	}

	private onSelection() {
		const group = window.editor.selectionGroup;
		if (this.multiSelection || this.isEmpty || !group) {
			return;
		}
		const selectedGameObject = group.selectedGameObjects[0];
		if (!selectedGameObject) return;
		this.blueprintGuid = selectedGameObject.blueprintCtrRef.instanceGuid.toString();
		this.blueprintPartitionGuid = selectedGameObject.blueprintCtrRef.partitionGuid.toString();
		this.blueprintName = selectedGameObject.blueprintCtrRef.name.toString();
		this.gameObjectGuid = selectedGameObject.guid.toString();
		const splitName = selectedGameObject.name.split('/');
		this.gameObjectName = splitName[splitName.length - 1];
		this.blueprintType = selectedGameObject.blueprintCtrRef.typeName.toString();
		const bp = window.editor.blueprintManager.getBlueprintByGuid(selectedGameObject.blueprintCtrRef.instanceGuid);
		if (bp) {
			this.blueprintVariations = bp.variations;
		} else {
			this.blueprintVariations = [{ hash: 0, name: 'default' }];
		}
		this.selectedVariation = selectedGameObject.variation;
		this.objectType = selectedGameObject.blueprintCtrRef.typeName;

		this.nOfObjectsInGroup = group.selectedGameObjects.length;
	}

	get isEmpty() {
		return (this.nOfObjectsInGroup === 0);
	}

	get multiSelection() {
		return (this.nOfObjectsInGroup > 1);
	}

	get displayName() {
		if (this.isEmpty) {
			return '';
		}
		return this.multiSelection ? 'Multiselection' : this.gameObjectName;
	}

	onStartDrag() {
		// console.log('Drag start');
		this.dragging = true;
	}

	onEndDrag() {
		// console.log('Drag end');
		const group = window.editor.selectionGroup;

		if (group) {
			group.onClientOnlyMoveEnd();
			this.dragging = false;
		}
	}

	private quatUpdated(newQuat: IQuat) {
		this.rotation = newQuat;
	}

	private onSelectionGroupChanged(group: SelectionGroup) {
		this.$nextTick(() => {
			const group = window.editor.selectionGroup;
			if (!this.dragging) {
				// Update inspector transform.
				this.position = group.transform.trans.toTable();
				this.scale = group.transform.scale.toTable();
				this.rotation = group.transform.rotation.toTable();
			}
			if (group.selectedGameObjects.length > 0) {
				this.enabled = group.selectedGameObjects[0].enabled;
			}
		});
	}

	private onEnableChange(e: Event) {	// TODO Fool: Enabling and disabling should work for multi-selection too.
		this.$nextTick(() => {
			const group = window.editor.selectionGroup;

			if (!group) {
				return;
			}

			if (this.enabled) {
				group.enable();
			} else {
				group.disable();
			}
		});
	}

	private onNameChange(e: InputEvent) {
		const group = window.editor.selectionGroup;

		if (!group || this.isEmpty) {
			return;
		}
		if ((e.target as any).value) {
			window.editor.execute(new SetObjectNameCommand(group.selectedGameObjects[0].getGameObjectTransferData(), (e.target as any).value));
		}
	}
}
</script>
<style lang="scss" scoped>
	.transformControls::v-deep input {
		width: 100%;
	}
	.inspector-component {
		.header {
			display: flex;
		}
		img.Large.Icon {
			margin: 10px;
		}
		.title {
			margin: 1vmin 0;
			font-size: 1.5em;
			font-weight: bold;
		}
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
		input#enabled {
			width: 20px;
			margin: 13px;
		}
	}
</style>
