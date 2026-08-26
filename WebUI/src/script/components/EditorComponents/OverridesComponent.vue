<template>
	<EditorComponent id="overrides-component" title="Overrides">
		<div class="overrides-body">
			<div v-if="!selectedGameObject" class="overrides-empty">Select an object to see its overrides.</div>
			<div v-else-if="overrideList.length === 0 && appliedList.length === 0" class="overrides-empty">
				No overrides on <span class="ov-name">{{ shortName }}</span> — edit a field to override it.
			</div>
			<template v-else>
				<div class="overrides-head">
					<span class="ov-count">{{ overrideList.length }} overridden {{ overrideList.length === 1 ? 'field' : 'fields' }} on {{ shortName }}</span>
					<button
						class="ov-apply"
						@click="onApply"
						title="Apply these overrides onto the base blueprint. Every instance of it rebuilds with these as the new defaults, keeping any of their own overrides not yet applied."
					>
						Apply to Blueprint
					</button>
				</div>
				<div class="ov-row" v-for="o in overrideList" :key="o.path">
					<div class="ov-info">
						<div class="ov-path" :title="o.path">{{ o.path }}</div>
						<div class="ov-values">
							<span class="ov-old" :title="String(o.oldValue)">{{ formatVal(o.oldValue) }}</span>
							<span class="ov-arrow">→</span>
							<span class="ov-new" :title="String(o.newValue)">{{ formatVal(o.newValue) }}</span>
						</div>
					</div>
					<button class="ov-revert" @click="onRevert(o)" title="Revert this field to the blueprint value">⟲</button>
				</div>
			</template>

			<!--
				The BLUEPRINT layer. Applying moves an override here rather than deleting it: it is
				still an override, it just belongs to every instance of the blueprint now. Showing
				nothing after an apply is what made a successful apply look like a revert.
			-->
			<template v-if="selectedGameObject && appliedList.length > 0">
				<div class="overrides-head applied-head">
					<span class="ov-count">
						{{ appliedList.length }} applied to blueprint {{ blueprintName }}
					</span>
					<button
						class="ov-apply"
						@click="onRevertAllApplied"
						title="Revert every applied override on this blueprint back to the value the game shipped."
					>
						Revert to Vanilla
					</button>
				</div>
				<div class="ov-row applied-row" v-for="o in appliedList" :key="'bp-' + o.path">
					<div class="ov-info">
						<div class="ov-path" :title="o.path">{{ o.path }}</div>
						<div class="ov-values">
							<span class="ov-badge">blueprint</span>
							<span class="ov-new" :title="String(o.newValue)">{{ formatVal(o.newValue) }}</span>
						</div>
					</div>
				</div>
			</template>
		</div>
	</EditorComponent>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import { isPrintable } from '@/script/modules/Utils';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
import SetEBXFieldCommand from '@/script/commands/SetEBXFieldCommand';
import ApplyBlueprintOverridesCommand from '@/script/commands/ApplyBlueprintOverridesCommand';

@Component({
	components: {
		EditorComponent
	}
})
export default class OverridesComponent extends EditorComponent {
	selectedGameObject: GameObject | null = null;

	mounted() {
		signals.selectedGameObject.connect(this.onSelectionChanged.bind(this));
		signals.deselectedGameObject.connect(this.onSelectionChanged.bind(this));
		// Fires after the ext echoes an EBX edit (FrostbiteDataManager applied the override just
		// before us), so the list refreshes as you edit.
		signals.setEBXField.connect(this.refresh.bind(this));
	}

	onSelectionChanged() {
		const group = window.editor.selectionGroup;
		this.selectedGameObject =
			group && group.selectedGameObjects.length === 1 ? group.selectedGameObjects[0] : null;
	}

	// overrides is a plain map mutated in place, so nudge Vue to recompute the list.
	refresh() {
		this.$forceUpdate();
	}

	get overrideList(): { path: string; label: string; newValue: any; oldValue: any }[] {
		return this.selectedGameObject ? this.selectedGameObject.overrideSummary : [];
	}

	get appliedList(): { path: string; label: string; newValue: any }[] {
		return this.selectedGameObject ? this.selectedGameObject.blueprintOverrideSummary : [];
	}

	get blueprintName(): string {
		const ref = this.selectedGameObject ? this.selectedGameObject.blueprintCtrRef : null;
		if (!ref || !ref.name) return '';
		const parts = String(ref.name).split('/');
		return parts[parts.length - 1];
	}

	onRevertAllApplied() {
		if (!this.selectedGameObject) return;
		window.vext.SendCommand({
			type: 'RevertBlueprintOverridesCommand',
			sender: '',
			gameObjectTransferData: { guid: this.selectedGameObject.guid.toString(), overrides: [] }
		} as any);
	}

	get shortName(): string {
		return this.selectedGameObject ? this.selectedGameObject.getCleanName() : '';
	}

	formatVal(v: any): string {
		if (v === null || v === undefined) return '—';
		if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
		if (typeof v === 'object') {
			if ('x' in v) {
				return ['x', 'y', 'z', 'w']
					.filter((k) => k in v)
					.map((k) => this.formatVal(v[k]))
					.join(', ');
			}
			return JSON.stringify(v);
		}
		return String(v);
	}

	onApply() {
		if (!this.selectedGameObject || this.overrideList.length === 0) return;
		window.editor.execute(
			new ApplyBlueprintOverridesCommand({
				guid: this.selectedGameObject.guid,
				reference: this.selectedGameObject.originalRef,
				overrides: this.selectedGameObject.overrides
			})
		);
		this.selectedGameObject.overrides = {};
		this.$forceUpdate();
	}

	// Revert a single field to its blueprint value: re-send the SAME override chain with the
	// printable leaf set back to its captured oldValue, then drop the local entry.
	onRevert(o: { path: string }) {
		if (!this.selectedGameObject) return;
		const stored = this.selectedGameObject.overrides[o.path];
		if (!stored) return;

		const revertLeaf = (node: IEBXFieldData): IEBXFieldData => {
			const clone: IEBXFieldData = { ...node };
			if (isPrintable(node.type)) {
				clone.value = (node as any).oldValue;
			} else {
				clone.value = revertLeaf(node.value as IEBXFieldData);
			}
			return clone;
		};

		window.editor.execute(
			new SetEBXFieldCommand({
				guid: this.selectedGameObject.guid,
				reference: this.selectedGameObject.originalRef,
				field: stored.field,
				type: stored.type,
				value: revertLeaf(stored.value as IEBXFieldData)
			})
		);

		// Drop the entry locally so the row clears immediately (the field now equals the base).
		const next = { ...this.selectedGameObject.overrides };
		delete next[o.path];
		this.selectedGameObject.overrides = next;
		this.$forceUpdate();
	}
}
</script>

<style lang="scss" scoped>
.overrides-body {
	padding: 6px 8px;
	font-size: 12px;
}

.overrides-empty {
	color: #7a8797;
	font-style: italic;
	padding: 6px 2px;

	.ov-name {
		color: #cdd6e0;
		font-style: normal;
	}
}

.overrides-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 6px;
	padding-bottom: 5px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ov-count {
	color: #4ea3ff;
	font-size: 11px;
	font-weight: 600;
}

.ov-apply {
	background-color: #037fff;
	color: #fff;
	border: 0;
	border-radius: 4px;
	padding: 4px 10px;
	font-size: 11px;
	font-weight: 600;
	cursor: pointer;

	&:hover {
		background-color: #2a95ff;
	}
}

.ov-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ov-info {
	min-width: 0;
	flex: 1 1 auto;
	margin-right: 8px;
}

.ov-path {
	font-family: 'Consolas', 'Menlo', monospace;
	font-size: 11px;
	color: #e0b64e;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.ov-values {
	display: flex;
	align-items: center;
	font-family: 'Consolas', 'Menlo', monospace;
	font-size: 11px;
	margin-top: 2px;
}

.ov-old {
	color: #7a8797;
	text-decoration: line-through;
	max-width: 90px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ov-arrow {
	color: #5f6f80;
	margin: 0 6px;
}

.ov-new {
	color: #57d18a;
	max-width: 120px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ov-revert {
	flex: 0 0 auto;
	background: rgba(255, 255, 255, 0.06);
	color: #cdd6e0;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 4px;
	width: 24px;
	height: 24px;
	font-size: 14px;
	line-height: 1;
	cursor: pointer;

	&:hover {
		background: rgba(224, 82, 82, 0.2);
		border-color: #e05252;
		color: #ff8c8c;
	}
}

/* The blueprint layer reads as a distinct tier, not as more personal overrides. */
.applied-head {
	margin-top: 8px;
	border-top: 1px solid rgba(255, 255, 255, 0.12);
	padding-top: 6px;
}
.applied-row .ov-path {
	opacity: 0.85;
}
.ov-badge {
	font-size: 9px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 1px 4px;
	margin-right: 6px;
	border-radius: 2px;
	background: rgba(120, 170, 255, 0.18);
	color: #9ec5ff;
}
</style>
