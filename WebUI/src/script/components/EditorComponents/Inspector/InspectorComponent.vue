<template>
	<EditorComponent class="inspector-component scrollable" title="Inspector">
		<div class="header">
			<div id="IconAndEnable" :class="enabled ? 'enabled' : ''">
				<div class="icon-wrapper">
					<img :class="'Large Icon Icon-' + objectType"  alt="" v-if="!multiSelection" >
					<img :class="'Large Icon Icon-MultiSelection'" alt="" v-else >
				</div>
			</div>
			<div id="NameAndVariation">
				<div>
					<input class="name-input" :value="displayName" :disabled="multiSelection" id="name" @blur="onNameChange">
				</div>
				<span class="blueprint-type" v-if="!multiSelection">
					{{ blueprintType ? blueprintType : "No type" }}
				</span>
				<span class="blueprint-type" v-else>
					Multiselection
				</span>
				<label class="custom-checkbox">
					Enable / Disable
					<input class="enable-input" type="checkbox" id="enabled" :disabled="multiSelection" ref="enableInput" v-model="enabled" >
					<span class="checkmark"></span>
				</label>
			</div>
			<div v-if="!multiSelection" class="details" :class="{collapsed: toggleState.info}">
				<div @click="toggleState.info = !toggleState.info" class="toggle">
					<i :class="{'el-icon-arrow-right': toggleState.info, 'el-icon-arrow-down': !toggleState.info}"></i>
					Details
				</div>
				<div class="details-grid">
					<div>
						<label for="bp-instance-guid">Instance Guid</label>
						<input id="bp-instance-guid" :value="blueprintGuid" disabled="true">
					</div>
					<div>
						<label for="bp-partition-guid">Partition Guid</label>
						<input id="bp-partition-guid" :value="blueprintPartitionGuid" disabled="true" >
					</div>
					<div>
						<label for="bp-guid">Guid</label>
						<input id="bp-guid" :value="gameObjectGuid" disabled="true">
					</div>
					<div>
						<label for="bp-partition-type">Type</label>
						<input id="bp-type" :value="blueprintType" disabled="true">
					</div>
					<div class="block">
						<label for="bp-name">Full name</label>
						<input id="bp-name" :value="blueprintName" disabled="true">
					</div>
				</div>
			</div>
			<div v-if="!multiSelection" class="variations" :class="{collapsed: toggleState.variations}">
				<div @click="toggleState.variations = !toggleState.variations" class="toggle">
					<i :class="{'el-icon-arrow-right': toggleState.variations, 'el-icon-arrow-down': !toggleState.variations}"></i>
					Variations
				</div>
				<div class="variations-grid">
					<div id="Variation" class="variation" v-if="!multiSelection">
						<el-select v-model="selectedVariation" size="mini" @change="onChangeVariation">
							<el-option v-for="variation of blueprintVariations" :key="variation.hash" :label="variation.name ? variation.name : 'Default variation'" :value="variation.hash"/>
						</el-select>
					</div>
					<div v-if="selectedGameObject && Object.keys(selectedGameObject.overrides).length > 0">
						<label>Overrides</label>
						<p v-for="(value, key) of Object.keys(selectedGameObject.overrides)" :key="key">{{value}}</p>
						<div v-if="Object.keys(selectedGameObject.overrides).length > 0">
	<!--							<button @click="selectedGameObject.applyOverrides">Apply</button>-->
	<!--							<button @click="selectedGameObject.revertOverrides">Revert</button>-->
						</div>
					</div>
				</div>
			</div>
		</div>
		<div class="inner">
			<div class="transform-container">
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
				<div class="alert">Experimental features, use with caution!</div>
				<Promised :promise="partition">
					<template v-slot:pending>
						<div class="loading">Loading...</div>
					</template>
					<template v-slot="data">
						<div class="ebx-wrapper">
								<div v-if="data && data.primaryInstance && data.primaryInstance.fields.object">
									<reference-property :overrides="selectedGameObject.EBXOverrides" :gameObject="selectedGameObject" @input="onEBXInput($event)" :autoOpen="true" :currentPath="data.name" :field="data.primaryInstance && data.primaryInstance.fields.object" :reference="data.primaryInstance.fields.object.value" :partition="data"></reference-property>
								</div>
								<div v-else-if="data && data.primaryInstance && data.primaryInstance.fields && data.primaryInstance.fields.objects">
									<array-property :overrides="selectedGameObject.EBXOverrides" :gameObject="selectedGameObject" @input="onEBXInput($event, true)" :autoOpen="data.primaryInstance.fields.objects.value.length < 6" :currentPath="data.name" :field="data.primaryInstance.fields.objects" :instance="data.primaryInstance" :reference="data.primaryInstance" :partition="data"></array-property>
								</div>
							</div>
					</template>
					<template v-slot:rejected="error">
						<div class="alert">Error: {{ error.message }}</div>
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
		info: true,
		variations: true
	}

	private getInstance(reference: Reference) {
		return window.editor.fbdMan.getInstance(reference.partitionGuid, reference.instanceGuid);
	}

	@Ref('enableInput')
	enableInput: HTMLInputElement;

	mounted() {
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

	private onEBXInput(value: IEBXFieldData, addObjectsField = false) {
		if (this.selectedGameObject) {
			value.guid = this.selectedGameObject.guid;
			if (addObjectsField) {
				window.editor.execute(new SetEBXFieldCommand({
					guid: this.selectedGameObject.guid,
					reference: this.selectedGameObject.originalRef,
					field: 'objects',
					type: 'GameObjectData',
					value: value
				}));
			} else {
				window.editor.execute(new SetEBXFieldCommand({
					guid: this.selectedGameObject.guid,
					reference: this.selectedGameObject.originalRef,
					field: 'object',
					type: 'GameObjectData',
					value: value
				}));
			}
		}
	}

	private onInput(newTrans: LinearTransform) {
		const group = window.editor.selectionGroup;
		if (group !== null) {
			// Move selection group to the new position.
			group.position.set(newTrans.position.x, newTrans.position.y, newTrans.position.z);
			group.scale.set(newTrans.scale.x, newTrans.scale.y, newTrans.scale.z);
			group.rotation.setFromQuaternion(newTrans.rotation);

			group.onClientOnlyMove();
			window.editor.editorCore.RequestUpdate();
		}
	}

	private onLocalInput(newTrans: LinearTransform) {
		const group = window.editor.selectionGroup;
		if (group !== null) {
			// Move selection group to the new position.
			// group.setMatrix(newTrans.toMatrix());
			group.position.set(newTrans.position.x, newTrans.position.y, newTrans.position.z);
			group.scale.set(newTrans.scale.x, newTrans.scale.y, newTrans.scale.z);
			group.rotation.setFromQuaternion(newTrans.rotation);

			group.onClientOnlyMove();
			window.editor.editorCore.RequestUpdate();
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
		window.editor.setUpdating(false);
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
			console.log('localTransform updated');
		}

		window.editor.editorCore.RequestUpdate();
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
		.inner {
			padding: 1.5vh;
		}

		.header {
			padding: 1.5vh;
			background: rgba(50, 58, 74, 0.4);
			display: grid;
			grid-template-columns: 20% 1fr;
			grid-gap: 1.5vh;
		}

		#IconAndEnable {
			display: flex;
			flex-flow: column;
			opacity: .5;

			div.icon-wrapper {
				margin: 0;
				text-align: center;
				width: 100%;
				background: #161924;
				border-radius: 0.5vh;
				padding: 1.5vh;
				box-sizing: border-box;

				.Icon {
					height: 100%;
					width: 100%;
				}
			}
			&.enabled {
				opacity: 1;
			}
		}

		#NameAndVariation {
			width: 100%;

			.name-input {
				height: 30px;
				margin-bottom: 10px;
			}

			span.blueprint-type {
				margin-bottom: 14px;
				font-size: 13px;
				width: 100%;
				display: inline-block;
				font-weight: 500;
				box-sizing: border-box;
				padding: 0 0 0 2px;
			}

			/*label {
				input#enabled {
					width: 16px;
					margin: 0;
					display: flex;
					align-items: center;
					justify-content: flex-start;
				}
			}*/
		}

		.variations,
		.details {
			width: 100%;
			grid-column: span 2 / auto;

			.toggle {
				i {
					margin-right: 4px;
				}
			}

			.guid-input {
				margin-top: 7px;
			}

			.details-grid {
				margin-top: 12px;
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				grid-gap: 7px;

				label {
					margin-bottom: 4px;
					display: block;
				}

				.block {
					grid-column: span 2 / auto;
				}
			}

			.variations-grid {
				display: grid;
				grid-template-columns: 1fr;
				grid-gap: 7px;

				.el-select {
					margin-top: 12px;
					width: 100%;
				}
			}
		}

		.transform-container {
			margin-bottom: 14px;

			.transformControls {
				display: grid;
				grid-template-columns: 1fr;
				grid-gap: 7px;
			}
		}

		.ebx-wrapper {
			margin-top: 14px;
		}

		.collapsed {
			height: 14px;
			overflow: hidden;
		}
	}
</style>
