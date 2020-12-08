<template>
	<EditorComponent class="inspector-component" title="Inspector">
		<div v-if="!isEmpty" class="scrollable">
			<div v-if="!multiSelection" class="bpInfo" :class="{collapsed: toggleState.info}">
				<div @click="toggleState.info = !toggleState.info">
					<i :class="{'el-icon-arrow-right': toggleState.info, 'el-icon-arrow-down': !toggleState.info}"></i>Info
				</div>
				<input class="guid-input" :value="gameObjectGuid" :disabled="true">
				<input class="Blueprint-input" id="bp-name" disabled="true" :value="blueprintName">
				<input class="Blueprint-input" id="bp-type" disabled="true" :value="blueprintType">
				<label for="bp-instance-guid">Instance Guid</label>
				<input class="Blueprint-input" id="bp-instance-guid" disabled="true" :value="blueprintGuid">
				<label for="bp-partition-guid">Partition Guid</label>
				<input class="Blueprint-input" id="bp-partition-guid" disabled="true" :value="blueprintPartitionGuid">
			</div>
			<div class="header">
				<div id="IconAndEnable">
					<img :class="'Large Icon Icon-' + objectType"/>
					<input class="enable-input" type="checkbox" id="enabled" :disabled="multiSelection" ref="enableInput" v-model="enabled" @change="onEnableChange">
				</div>
				<div>
					<input class="name-input" :value="displayName" :disabled="multiSelection" @input="onNameChange" id="name">
				</div>
			</div>
			<div class="container transform-container">

				<linear-transform-control class="lt-control" :hideLabel="false"
										:value="selectedGameObject.transform"
										@input="onInput" @startDrag="onStartDrag" @endDrag="onEndDrag" @quatUpdated="quatUpdated" @blur="onEndDrag"/>
			</div>
			<div class="container variation">
				<el-select v-model="selectedVariation" size="mini" @change="onChangeVariation">
					<el-option v-for="variation of blueprintVariations" :key="variation.hash" :label="variation.name" :value="variation.hash"/>
				</el-select>
			</div>
			<div class="container ebx-container" v-if="selectedGameObject && selectedPartition && selectedPartition.data">
				<template v-if="selectedPartition && selectedPartition.primaryInstance && selectedPartition.primaryInstance.fields.object">
					<ReferenceProperty :autoOpen="true" :currentPath="selectedPartition.name" :field="selectedPartition.primaryInstance && selectedPartition.primaryInstance.fields.object" :partition="selectedPartition"></ReferenceProperty>
					<!--
					<span>
						<Instance :currentPath="selectedPartition.name" v-if="selectedPartition.primaryInstance.fields.object.value" :instance=getInstance(selectedPartition.primaryInstance.fields.object.value) :partition="selectedPartition"></Instance>
					</span>
					-->
				</template>
				<template v-else-if="selectedPartition.primaryInstance && selectedPartition.primaryInstance.fields && selectedPartition.primaryInstance.fields.objects">
					<ArrayProperty :autoOpen="true" :currentPath="selectedPartition.name" :field="selectedPartition.primaryInstance && selectedPartition.primaryInstance.fields.objects" :partition="selectedPartition"></ArrayProperty>
				</template>
			</div>
		</div>
	</EditorComponent>
</template>

<script lang="ts">
import { Component, Ref } from 'vue-property-decorator';
import EditorComponent from '../EditorComponent.vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import { SelectionGroup } from '@/script/types/SelectionGroup';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { IQuat, Quat } from '@/script/types/primitives/Quat';
import { GameObject } from '@/script/types/GameObject';
import SetVariationCommand from '@/script/commands/SetVariationCommand';
import Partition from './EBXComponents/Partition.vue';
import Instance from '@/script/components/EditorComponents/Inspector/EBXComponents/Instance.vue';
import { FBPartition } from '@/script/types/gameData/FBPartition';
import Reference from '@/script/types/ebx/Reference';
import ArrayProperty from './EBXComponents/ArrayProperty.vue';
import ReferenceProperty from './EBXComponents/ReferenceProperty.vue';

@Component({ components: { LinearTransformControl, EditorComponent, Partition, Instance, ArrayProperty, ReferenceProperty } })
export default class InspectorComponent extends EditorComponent {
	public selectedGameObject: GameObject;

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
	private selectedPartition: FBPartition | null = null;

	private toggleState = {
		info: true
	}

	private getInstance(reference: Reference) {
		return window.editor.fbdMan.getInstance(reference.partitionGuid, reference.instanceGuid);
	}

	@Ref('enableInput')
	enableInput: HTMLInputElement;

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
		this.nOfObjectsInGroup = group.selectedGameObjects.length;
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

		this.selectedGameObject = selectedGameObject;
		this.selectedPartition = window.editor.fbdMan.getPartitionByName(this.selectedGameObject.blueprintCtrRef.name);
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
		#IconAndEnable {
			margin: 10px;
		}
		.title {
			margin: 1em 0;
			font-size: 1.5em;
			font-weight: bold;
		}
		.enable-container {
			display: flex;
			flex-direction: row;
			align-content: center;
			.enable-label {
				margin: 1em 0;
				font-weight: bold;
			}

			.enable-input {
				height: 1.5em;
				margin: 1em 0;
			}
		}

		.name-label {
			margin: 1em 0;
			font-weight: bold;
		}

		.name-input {
			margin: 1em 0 0 0;
			border-radius: 0.5em;
			padding: 0.2em 0.2em 0.2em 1em;
		}
		input#enabled {
			width: 20px;
			margin: 13px;
		}
		.ebx-container {
			padding-left: 1em;
		}
		.collapsed {
			height: 1em;
			overflow: hidden;
		}
	}
</style>
