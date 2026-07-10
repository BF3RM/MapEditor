<template>
	<div class="EditorComponent panel inspector-component scrollable">
		<div class="panel-header">Inspector</div>
		<div class="panel-body">
		<div class="header" style="display:flex; flex-direction:column; gap:10px; padding:12px;">
			<div id="IconAndEnable" :class="enabled ? 'enabled' : ''" style="flex:0 0 auto; width:48px; height:48px;">
				<div class="icon-wrapper" style="width:48px; height:48px; padding:6px; box-sizing:border-box;">
					<img :class="'Large Icon Icon-' + objectType" alt="" v-if="!multiSelection" />
					<img :class="'Large Icon Icon-MultiSelection'" alt="" v-else />
				</div>
			</div>
			<div id="NameAndVariation" style="width:100%; min-width:0;">
				<div>
					<input
						style="width:100%; box-sizing:border-box;"
						class="name-input"
						:value="displayName"
						:disabled="multiSelection"
						id="name"
						@blur="onNameChange"
					/>
				</div>
				<span class="blueprint-type" v-if="!multiSelection">
					{{ blueprintType ? blueprintType : 'No type' }}
				</span>
				<span class="blueprint-type" v-else> Multiselection </span>
				<!-- Gameface port: native checkbox doesn't toggle reliably -> plain
				     clickable div (same enable()/disable() path). -->
				<div class="fx-checkbox" :class="{ checked: enabled, disabled: multiSelection }">
					<span class="fx-checkbox-box" @click="onToggleEnable">
						<span class="fx-check"></span>
					</span>
					<span class="fx-checkbox-label">Enable / Disable</span>
				</div>
			</div>
			<div v-if="!multiSelection" class="details" :class="{ collapsed: toggleState.info }" style="width:100%; min-width:0;">
				<div @click="toggleState.info = !toggleState.info" class="toggle">
					<span class="fx-caret" :class="{ open: !toggleState.info }"></span>
					Details
				</div>
				<div class="details-grid">
					<div>
						<label for="bp-instance-guid">Instance Guid</label>
						<input id="bp-instance-guid" :value="blueprintGuid" readonly @click="$event.target.select()" />
					</div>
					<div>
						<label for="bp-partition-guid">Partition Guid</label>
						<input id="bp-partition-guid" :value="blueprintPartitionGuid" readonly @click="$event.target.select()" />
					</div>
					<div>
						<label for="bp-guid">Guid</label>
						<input id="bp-guid" :value="gameObjectGuid" readonly @click="$event.target.select()" />
					</div>
					<div>
						<label for="bp-partition-type">Type</label>
						<input id="bp-type" :value="blueprintType" readonly @click="$event.target.select()" />
					</div>
					<div class="block">
						<label for="bp-name">Full name</label>
						<input id="bp-name" :value="blueprintName" readonly @click="$event.target.select()" />
					</div>
				</div>
			</div>
			<div v-if="!multiSelection" class="variations" :class="{ collapsed: toggleState.variations }" style="width:100%; min-width:0;">
				<div @click="toggleState.variations = !toggleState.variations" class="toggle">
					<span class="fx-caret" :class="{ open: !toggleState.variations }"></span>
					Variations
				</div>
				<div class="variations-grid">
					<div id="Variation" class="variation" v-if="!multiSelection">
						<!-- Gameface port: variation options listed directly (no dropdown). -->
						<div class="variation-list">
							<div
								v-for="variation of blueprintVariations"
								:key="variation.hash"
								class="variation-option"
								:class="{ active: selectedVariation === variation.hash }"
								@click="onVariationClick(variation.hash)"
							>
								{{ variation.name ? variation.name : 'Default variation' }}
							</div>
						</div>
					</div>
					<div v-if="selectedGameObject && Object.keys(selectedGameObject.overrides).length > 0">
						<label>Overrides</label>
						<p v-for="(value, key) of Object.keys(selectedGameObject.overrides)" :key="key">{{ value }}</p>
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
					@blur="onEndDrag"
				/>
				<linear-transform-control
					v-else
					class="lt-control"
					:hideLabel="false"
					:value="transform"
					@input="onInput"
					@dragend="onEndDrag"
					@blur="onEndDrag"
				/>
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
								<reference-property
									:overrides="selectedGameObject.EBXOverrides"
									:gameObject="selectedGameObject"
									@input="onEBXInput($event)"
									:autoOpen="true"
									:currentPath="data.name"
									:field="data.primaryInstance && data.primaryInstance.fields.object"
									:reference="data.primaryInstance.fields.object.value"
									:partition="data"
								></reference-property>
							</div>
							<div
								v-else-if="
									data &&
									data.primaryInstance &&
									data.primaryInstance.fields &&
									data.primaryInstance.fields.objects
								"
							>
								<array-property
									:overrides="selectedGameObject.EBXOverrides"
									:gameObject="selectedGameObject"
									@input="onEBXInput($event, true)"
									:autoOpen="data.primaryInstance.fields.objects.value.length < 6"
									:currentPath="data.name"
									:field="data.primaryInstance.fields.objects"
									:instance="data.primaryInstance"
									:reference="data.primaryInstance"
									:partition="data"
								></array-property>
							</div>
						</div>
					</template>
					<template v-slot:rejected="error">
						<div class="alert">Error: {{ error.message }}</div>
					</template>
				</Promised>
			</div>
		</div>
		</div>
	</div>
</template>

<script lang="ts">
import { Component, Ref } from 'vue-property-decorator';
import EditorComponent from '../EditorComponent.vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import { GameObject } from '@/script/types/GameObject';
import SetVariationCommand from '@/script/commands/SetVariationCommand';
import Partition from './EBXComponents/Partition.vue';
import Reference from '@/script/types/ebx/Reference';
import ArrayProperty from './EBXComponents/ArrayProperty.vue';
import ReferenceProperty from '@/script/components/EditorComponents/Inspector/EBXComponents/ReferenceProperty.vue';
import { Promised } from 'vue-promised';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { WORLD_SPACE } from '@/script/types/Enums';
import SetEBXFieldCommand, { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';

@Component({
	components: { LinearTransformControl, EditorComponent, Partition, ArrayProperty, ReferenceProperty, Promised }
})
export default class InspectorComponent extends EditorComponent {
	data() {
		return {
			partition: undefined
		};
	}

	selectedGameObject: GameObject | null = null;

	enabled = true;
	gameObjectGuid: string = '';
	gameObjectName: string = '';
	blueprintName: string = '';
	blueprintType: string = '';
	blueprintGuid: string = '';
	blueprintPartitionGuid: string = '';
	blueprintVariations: { hash: number; name: string }[] = [];
	selectedVariation = 0;
	variationMenuOpen = false;
	private boundCloseVariationMenu = () => {
		this.variationMenuOpen = false;
	};
	objectType = '';
	nOfObjectsInGroup = 0;
	partition: any;
	worldSpace: WORLD_SPACE = WORLD_SPACE.local;
	transform: LinearTransform = new LinearTransform();
	localTransform: LinearTransform = new LinearTransform();

	toggleState = {
		info: true,
		variations: true
	};

	getInstance(reference: Reference) {
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
		document.addEventListener('click', this.boundCloseVariationMenu);
	}

	beforeDestroy() {
		document.removeEventListener('click', this.boundCloseVariationMenu);
	}

	get selectedVariationLabel(): string {
		const v = this.blueprintVariations.find((x) => x.hash === this.selectedVariation);
		return v && v.name ? v.name : 'Default variation';
	}

	onVariationClick(hash: number) {
		this.variationMenuOpen = false;
		this.selectedVariation = hash;
		this.onChangeVariation(hash);
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

	onChangeVariation(newVariation: number) {
		console.log(newVariation);
		if (window.editor.selectionGroup.selectedGameObjects.length !== 1) {
			return;
		}
		const command = new SetVariationCommand(
			window.editor.selectionGroup.selectedGameObjects[0].getGameObjectTransferData(),
			newVariation
		);
		window.editor.execute(command);
	}

	onEBXInput(value: IEBXFieldData, addObjectsField = false) {
		if (this.selectedGameObject) {
			value.guid = this.selectedGameObject.guid;
			if (addObjectsField) {
				window.editor.execute(
					new SetEBXFieldCommand({
						guid: this.selectedGameObject.guid,
						reference: this.selectedGameObject.originalRef,
						field: 'objects',
						type: 'GameObjectData',
						value: value
					})
				);
			} else {
				window.editor.execute(
					new SetEBXFieldCommand({
						guid: this.selectedGameObject.guid,
						reference: this.selectedGameObject.originalRef,
						field: 'object',
						type: 'GameObjectData',
						value: value
					})
				);
			}
		}
	}

	onInput(newTrans: LinearTransform) {
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

	onLocalInput(newTrans: LinearTransform) {
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
		return this.nOfObjectsInGroup === 0;
	}

	get multiSelection() {
		return this.nOfObjectsInGroup > 1;
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

	onToggleEnable() {
		if (this.multiSelection) {
			return;
		}
		this.enabled = !this.enabled;
		this.onEnableChange();
	}

	onEnableChange() {
		// TODO Fool: Enabling and disabling should work for multi-selection too.
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

	onNameChange(e: InputEvent) {
		const group = window.editor.selectionGroup;

		if (!group || this.isEmpty) {
			return;
		}
		if ((e.target as any).value) {
			window.editor.execute(
				new SetObjectNameCommand(
					group.selectedGameObjects[0].getGameObjectTransferData(),
					(e.target as any).value
				)
			);
		}
	}
}
</script>
<style lang="scss">
/* Gameface port: NOT scoped. InspectorComponent's root is <EditorComponent> (and it
   extends it), which broke Vue 2 scoped-attribute matching -> none of these rules
   applied and the content overflowed out of the panel. Prefixed with
   .inspector-component so it still only affects the inspector. */
.inspector-component .transformControls input {
	width: 100%;
}

/* CSS triangle caret — unicode arrows (▸/▾) render as tofu boxes in Gameface. */
.fx-caret {
	display: inline-block;
	width: 0;
	height: 0;
	border-left: 5px solid #8da1b6;
	border-top: 4px solid transparent;
	border-bottom: 4px solid transparent;
	margin-right: 7px;
	vertical-align: middle;
}
.fx-caret.open {
	transform: rotate(90deg);
}

/* Gameface port: plain-div Enable/Disable checkbox (native checkbox unreliable). */
.fx-checkbox {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: #fff;
	user-select: none;
}
.fx-checkbox.disabled {
	opacity: 0.5;
	pointer-events: none;
}
.fx-checkbox-label {
	cursor: default;
}
.fx-checkbox-box {
	position: relative;
	flex: 0 0 18px;
	width: 18px;
	height: 18px;
	border-radius: 3px;
	background: #eee;
	cursor: pointer;
}
.fx-checkbox.checked .fx-checkbox-box {
	background: #037fff;
}
.fx-check {
	display: none;
}
.fx-checkbox.checked .fx-check {
	display: block;
	position: absolute;
	left: 6px;
	top: 1px;
	width: 6px;
	height: 11px;
	border: solid #fff;
	border-width: 0 3px 3px 0;
	-webkit-transform: rotate(45deg);
	transform: rotate(45deg);
}

/* Variation options shown directly as a clickable list. */
.variation-list {
	display: flex;
	flex-direction: column;
	gap: 2px;
	max-height: 180px;
	overflow-y: auto;
}
.variation-option {
	padding: 5px 10px;
	font-size: 13px;
	color: #dfe4ea;
	background: #1f2633;
	border: 1px solid #05070b;
	border-radius: 4px;
	cursor: pointer;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.variation-option:hover {
	background: #2a3242;
}
.variation-option.active {
	background: #037fff;
	color: #fff;
}

.EditorComponent.inspector-component {
	/* Keep every inspector control within the panel width. Higher specificity than
	   EditorComponent's own `.EditorComponent.panel > .panel-body { overflow:auto }`
	   and `.EditorComponent .header { display:flex }`, which otherwise win. */
	&.panel > .panel-body {
		overflow-x: hidden;
	}

	input {
		max-width: 100%;
		box-sizing: border-box;
	}

	.ebx-container {
		overflow-x: auto;
		max-width: 100%;
	}

	.inner {
		padding: 1.5vh;
		min-width: 0;
	}

	.header {
		padding: 1.5vh;
		background: rgba(50, 58, 74, 0.4);
		display: grid;
		grid-template-columns: 20% minmax(0, 1fr);
		grid-gap: 1.5vh;
	}

	#IconAndEnable {
		display: flex;
		flex-flow: column;
		opacity: 0.5;

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
		min-width: 0;

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

		/* Gameface has no CSS Grid -> flexbox. */
		.details-grid {
			margin-top: 12px;
			display: flex;
			flex-direction: column;
			gap: 7px;

			> div {
				width: 100%;
				min-width: 0;
			}

			label {
				margin-bottom: 3px;
				display: block;
				font-size: 11px;
				color: #8da1b6;
			}

			input {
				width: 100%;
				box-sizing: border-box;
			}
		}

		.variations-grid {
			display: flex;
			flex-direction: column;
			gap: 7px;

			.el-select {
				margin-top: 12px;
				width: 100%;
			}
		}
	}

	.transform-container {
		margin-bottom: 14px;

		/* Gameface has no CSS Grid -> flexbox column. */
		.transformControls {
			display: flex;
			flex-direction: column;
			gap: 7px;
		}
	}

	.ebx-wrapper {
		margin-top: 14px;
	}

	/* Collapse = hide the content grid, keep the full toggle row visible (the old
	   height:14px clipped the "Details"/"Variations" label). */
	.details.collapsed .details-grid,
	.variations.collapsed .variations-grid {
		display: none;
	}

	.details .toggle,
	.variations .toggle {
		cursor: pointer;
		display: flex;
		align-items: center;
		font-size: 13px;
		padding: 3px 0;
	}
}
</style>
