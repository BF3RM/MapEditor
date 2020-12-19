<template>
	<EditorComponent class="inspector-component" title="Inspector">
		<div class="scrollable">
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
				<div id="NameAndVariation">
					<div id="Name">
						<input class="name-input" :value="displayName" :disabled="multiSelection" @input="onNameChange" id="name">
					</div>
					<div id="Variation" class="container variation" v-if="!multiSelection">
						<el-select v-model="selectedVariation" size="mini" @change="onChangeVariation">
							<el-option v-for="variation of blueprintVariations" :key="variation.hash" :label="variation.name ? variation.name : 'Default variation'" :value="variation.hash"/>
						</el-select>
					</div>
					<div v-if="selectedGameObject && selectedGameObject.overrides.values().length > 0">
						<b>Overrides:</b>
						<p v-for="(value, key) of selectedGameObject.overrides.values()" :key="key">{{value.field}}</p>
					</div>
				</div>
			</div>
			<div class="container transform-container">
					<linear-transform-control
							v-if="worldSpace === 'local'"
							class="lt-control"
							:hideLabel="false"
							:value="localTransform"
							@input="onLocalInput"
							@dragend="onEndDrag"
							@blur="onEndDrag" />
					<linear-transform-control
							v-else
							class="lt-control"
							:hideLabel="false"
							:value="transform"
							@input="onInput"
							@dragend="onEndDrag"
							@blur="onEndDrag" />
			</div>
			<div class="container ebx-container" v-if="selectedGameObject && !multiSelection">
				<Promised :promise="partition">
					<template v-slot:pending>
						<p>Loading...</p>
					</template>
					<template v-slot="data">
						<div v-if="data && data.primaryInstance && data.primaryInstance.fields.object">
							<reference-property :gameObject="selectedGameObject" @input="onEBXInput($event)" :autoOpen="true" :currentPath="data.name" :field="data.primaryInstance && data.primaryInstance.fields.object" :reference="data.primaryInstance.fields.object.value" :partition="data"></reference-property>
						</div>
						<div v-else-if="data && data.primaryInstance && data.primaryInstance.fields && data.primaryInstance.fields.objects">
							<reference-property :gameObject="selectedGameObject" @input="onEBXInput($event)" v-for="(instance, index) of data.primaryInstance.fields.objects.value" :key="index" :autoOpen="data.primaryInstance.fields.objects.value.length < 6" :currentPath="data.name" :field="instance" :instance="instance" :reference="instance.value" :partition="data"></reference-property>
						</div>
					</template>
					<template v-slot:rejected="error">
						<p>Error: {{ error.message }}</p>
					</template>
				</Promised>
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
import { GameObject } from '@/script/types/GameObject';
import SetVariationCommand from '@/script/commands/SetVariationCommand';
import Partition from './EBXComponents/Partition.vue';
import { FBPartition } from '@/script/types/gameData/FBPartition';
import Reference from '@/script/types/ebx/Reference';
import ArrayProperty from './EBXComponents/ArrayProperty.vue';
import ReferenceProperty from '@/script/components/EditorComponents/Inspector/EBXComponents/ReferenceProperty.vue';
import { Promised } from 'vue-promised';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { WORLD_SPACE } from '@/script/types/Enums';
import { CtrRef } from '@/script/types/CtrRef';
import SetEBXFieldCommand, { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
import Instance from '@/script/types/ebx/Instance';

@Component({ components: { LinearTransformControl, EditorComponent, Partition, ArrayProperty, ReferenceProperty, Promised } })
export default class InspectorComponent extends EditorComponent {
	data() {
		return {
			partition: undefined
		};
	}

	public selectedGameObject: GameObject | null = null;

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
	private partition: any;
	private worldSpace: WORLD_SPACE = WORLD_SPACE.local;
	private transform: LinearTransform = new LinearTransform();
	private localTransform: LinearTransform = new LinearTransform();

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
		signals.worldSpaceChanged.connect(this.onWorldSpaceUpdated.bind(this));
	}

	private onWorldSpaceUpdated(ws: WORLD_SPACE) {
		this.worldSpace = ws;
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

	private onEBXInput(value: IEBXFieldData) {
		console.log(value);
		if (this.selectedGameObject) {
			value.guid = this.selectedGameObject.guid;
		}
		window.editor.execute(new SetEBXFieldCommand(value));
	}

	private onInput(newTrans: LinearTransform) {
		const group = window.editor.selectionGroup;
		if (group !== null) {
			// Move selection group to the new position.
			group.position.set(newTrans.position.x, newTrans.position.y, newTrans.position.z);
			group.scale.set(newTrans.scale.x, newTrans.scale.y, newTrans.scale.z);
			group.rotation.setFromQuaternion(newTrans.rotation);

			group.updateMatrix();
			group.onClientOnlyMove();

			window.editor.threeManager.setPendingRender();
		}
	}

	private onLocalInput(newTrans: LinearTransform) {
		const group = window.editor.selectionGroup;
		if (group !== null) {
			// Move selection group to the new position.
			group.setMatrix(newTrans.toMatrix());
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
		this.$data.partition = this.selectedGameObject.partition;
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

	onEndDrag() {
		const group = window.editor.selectionGroup;

		if (group) {
			group.onClientOnlyMoveEnd();
		}
	}

	private onSelectionGroupChanged() {
		const group = window.editor.selectionGroup;
		// Update inspector transform.
		this.transform = group.transform;

		if (group.selectedGameObjects.length > 0) {
			this.enabled = group.selectedGameObjects[0].enabled;
			this.localTransform = group.selectedGameObjects[0].localTransform;
		}
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
			width: 21%;
			margin: 10px;
		}
		#NameAndVariation {
			width: 100%;
		}
		#Variation {
			margin-top: 1em;
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
