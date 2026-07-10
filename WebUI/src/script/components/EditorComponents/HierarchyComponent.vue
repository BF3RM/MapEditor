<template>
	<EditorComponent id="explorer-component" title="Scene Instances">
		<div class="header">
			<Search v-model="search" />
		</div>
		<infinite-tree-component
			class="scrollable datafont"
			ref="infiniteTreeComponent"
			:search="search"
			:autoOpen="true"
			:data="data"
			:selectable="true"
			:row-height="25"
			:should-select-node="shouldSelectNode"
			@node-activate="onHierarchyActivate"
			@node-toggle-enable="onDelegatedToggleEnable"
		>
			<expandable-tree-slot
				slot-scope="{ node, tree }"
				:has-visibility-options="true"
				:node="node"
				:tree="tree"
				:search="search"
				:content="node.content"
				:nodeText="nodeText(node)"
				:selected="node.state.selected"
				@node:toggle-enable="onNodeToggleEnable"
				@node:toggle-raycast-enable="onNodeToggleRaycastEnable"
				@node:toggle-select="onToggleSelect"
				@node:hover="onNodeHover"
				@node:hover-end="onNodeHoverEnd"
				@node:click="onNodeClick"
			/>
		</infinite-tree-component>
	</EditorComponent>
	<!--<ListComponent class="datafont" title="Explorer data"
					:list="list"
					:keyField="'instanceGuid'"
					:headers="['Name', 'Type']"
					:click="SpawnBlueprint">
			<template slot-scope="{ item, data }">
				<div class="slot-scope">
					<Highlighter class="td" :text="cleanPath(item.name)" :search="search"/><div class="td">{{item.typeName}}</div>
				</div>
			</template>
		</ListComponent>-->
</template>

<script lang="ts">
import { Component, Ref } from 'vue-property-decorator';
import EditorComponent from '@/script/components/EditorComponents/EditorComponent.vue';
import InfiniteTreeComponent from '@/script/components/InfiniteTreeComponent.vue';
import { signals } from '@/script/modules/Signals';
import { Blueprint } from '@/script/types/Blueprint';
import Highlighter from '../widgets/Highlighter.vue';
import ListComponent from '@/script/components/EditorComponents/ListComponent.vue';
import InfiniteTree, { Node, INode } from 'infinite-tree';
import { CommandActionResult } from '@/script/types/CommandActionResult';
import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';
import Search from '@/script/components/widgets/Search.vue';
import ExpandableTreeSlot from '@/script/components/EditorComponents/ExpandableTreeSlot.vue';
import { GAMEOBJECT_ORIGIN, REALM } from '@/script/types/Enums';

@Component({
	components: { InfiniteTreeComponent, ListComponent, Highlighter, Search, ExpandableTreeSlot, EditorComponent }
})
export default class HierarchyComponent extends EditorComponent {
	data: INode[] = [
		{
			type: 'folder',
			name: 'Vanilla',
			id: 'vanilla_root',
			children: [],
			content: [
				{
					enabled: true,
					raycastEnabled: true,
					realm: REALM.CLIENT_AND_SERVER
				}
			]
		},
		{
			type: 'folder',
			name: 'Custom',
			id: 'custom_root',
			children: [],
			content: [
				{
					enabled: true,
					raycastEnabled: true,
					realm: REALM.CLIENT_AND_SERVER
				}
			]
		}
	];

	tree: InfiniteTree;
	list: Blueprint[] = [];
	selected: Node[] = [];

	search: string = '';

	queue = new Map<string, INode>();
	existingParents = new Map<string, INode[]>();

	@Ref('infiniteTreeComponent')
	infiniteTreeComponent: any;

	public mounted() {
		console.log('Mounted');
		signals.spawnedGameObject.connect(this.onSpawnedGameObject.bind(this));
		signals.deletedGameObject.connect(this.onDeletedGameObject.bind(this));
		// signals.enabledGameObject.connect(this.onEnabledBlueprint.bind(this));
		// signals.disabledGameObject.connect(this.onDisabledBlueprint.bind(this));
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
		signals.deselectedGameObject.connect(this.onDeselectedGameObject.bind(this));
		signals.objectChanged.connect(this.onObjectChanged.bind(this));

		if (this.infiniteTreeComponent !== undefined) {
			this.tree = this.infiniteTreeComponent.tree as InfiniteTree;
		}
	}

	private createNode(gameObject: GameObject): INode {
		return {
			id: gameObject.guid.toString(),
			name: gameObject.getCleanName(),
			type: gameObject.blueprintCtrRef.typeName,
			children: [],
			content: [
				{
					parentGuid: gameObject.parentData.guid,
					enabled: gameObject.enabled,
					raycastEnabled: gameObject.raycastEnabled,
					realm: gameObject.realm
				}
			]
		};
	}

	nodeText(node: Node) {
		return node.children.length === 0 ? node.name : node.name + ' (' + node.children.length + ')';
	}

	onDeletedGameObject(commandActionResult: CommandActionResult) {
		const node = this.tree.getNodeById(commandActionResult.gameObjectTransferData.guid.toString());
		this.tree.removeNode(node, {});
	}

	onSpawnedGameObject(commandActionResult: CommandActionResult) {
		const gameObjectGuid = commandActionResult.gameObjectTransferData.guid;
		const gameObject = (window as any).editor.getGameObjectByGuid(gameObjectGuid);

		// Don't add preview object to hierarchy.
		if (gameObject.parentData.typeName === 'previewSpawn') return;

		const currentEntry = this.createNode(gameObject);
		this.queue.set(currentEntry.id, currentEntry);

		if (!window.vext.executing) {
			for (const entry of this.queue.values()) {
				// Check if the parent is in the queue
				if (!entry.content || !entry.content[0]) {
					console.error('Found node without content field');
					continue;
				}
				const parentId = entry.content[0].parentGuid.toString();
				if (this.queue.has(parentId)) {
					this.queue.get(parentId)!.children!.push(entry);
					// Check if the parent node is already spawned
				} else if (this.tree.getNodeById(parentId) !== null) {
					if (!this.existingParents.has(parentId)) {
						this.existingParents.set(parentId, []);
					}
					console.log('Existing' + entry.name);
					this.existingParents.get(parentId)!.push(entry);
				} else {
					// Entry does not have a parent.
					const rootId =
						gameObject.origin === GAMEOBJECT_ORIGIN.VANILLA ||
						gameObject.origin == GAMEOBJECT_ORIGIN.NOHAVOK
							? 'vanilla_root'
							: 'custom_root';

					if (!this.existingParents.has(rootId)) {
						this.existingParents.set(rootId, []);
					}
					// console.log('Root');
					this.existingParents.get(rootId)!.push(entry);
				}
			}
			for (const parentNodeId of this.existingParents.keys()) {
				const parentNode = this.tree.getNodeById(parentNodeId);
				if (parentNode === null) {
					console.error('Missing parent node');
				} else {
					this.tree.addChildNodes(this.existingParents.get(parentNodeId) as INode[], undefined, parentNode);
				}
				this.existingParents.delete(parentNodeId);
			}
			this.queue.clear();
		}
	}

	onSelectedGameObject(guid: Guid, isMultipleSelection?: boolean, scrollTo?: boolean) {
		const currentNode = this.tree.getNodeById(guid.toString());
		// console.log(isMultipleSelection);
		currentNode.state.selected = true;
		if (guid.isEmpty()) {
			this.list = [];
			this.selected = [];
			return;
		}
		if (!isMultipleSelection && this.selected.length > 0) {
			this.selected.forEach((node) => {
				node.state.selected = false;
			});
			this.selected = [];
		}
		this.selected.push(currentNode);
		currentNode.state.selected = true;
		this.$set(currentNode.state, 'enabled', true);
		if (scrollTo) {
			this.infiniteTreeComponent.openParentNodes(currentNode);
			setTimeout(() => {
				this.infiniteTreeComponent.scrollTo(currentNode);
			}, 1);
		}
	}

	private onDeselectedGameObject(guid: Guid) {
		const node = this.tree.getNodeById(guid.toString());
		if (node) {
			node.state.selected = false;
			const nodeIndex = this.selected.findIndex((i) => {
				// console.log(i.id === node.id);
				return i.id === node.id;
			});
			this.selected.splice(nodeIndex, 1);
		}
	}

	onNodeToggleEnable(node: Node) {
		if (!node.content || !node.content[0]) {
			return;
		}
		const guid = Guid.parse(node.id.toString());
		if (guid.isEmpty()) return;

		if (node.content[0].enabled) {
			window.editor.Disable(guid);
		} else {
			window.editor.Enable(guid);
		}
	}

	onNodeToggleRaycastEnable(node: Node) {
		if (!node.content || !node.content[0]) {
			return;
		}
		const guid = Guid.parse(node.id.toString());
		if (guid.isEmpty()) return;

		window.editor.ToggleRaycastEnabled(guid, !node.content[0].raycastEnabled);
	}

	// Multi-select checkbox next to the eye: add/remove this object from the current
	// selection (the box shows an X when selected).
	onToggleSelect(node: Node) {
		const guid = Guid.parse(node.id.toString());
		if (guid.isEmpty()) return;
		if (node.state && node.state.selected) {
			window.editor.Deselect(guid);
		} else {
			// multiSelection = true (add), moveGizmo = false so the pivot stays on the
			// first-selected object.
			window.editor.Select(guid, true, false, false);
		}
		window.editor.threeManager.syncNativeSelection();
	}

	private lastHoverTime = 0;

	onNodeHover(nodeId: string) {
		// Throttle: onHighlight/onUnhighlight recurse through children/parents, so doing
		// it on every pixel of mouse movement over the huge list is wasteful.
		const now = Date.now();
		if (now - this.lastHoverTime < 60) return;
		this.lastHoverTime = now;
		const guid = Guid.parse(nodeId.toString());
		if (guid.isEmpty()) return;
		window.editor.editorCore.highlight(guid);
	}

	onNodeHoverEnd() {
		window.editor.editorCore.unhighlight();
	}

	// Gameface port: fired by the delegated listener on the tree scroll container (per-row
	// listeners silently fail on this streaming tree). Routes to the existing click logic.
	onHierarchyActivate(o: { node: Node; event: MouseEvent }) {
		if (o && o.node) {
			this.onNodeClick({ event: o.event, nodeId: o.node.id });
		}
	}

	// Gameface port: the eye button is driven by the same delegated listener (its per-row
	// @click doesn't fire in Cohtml). Routes to the existing enable/disable toggle.
	onDelegatedToggleEnable(o: { node: Node; event: MouseEvent }) {
		if (o && o.node) {
			this.onNodeToggleEnable(o.node);
		}
	}

	onNodeClick(o: any) {
		const guid = Guid.parse(o.nodeId.toString());

		if (guid.isEmpty()) return;

		const e = o.event;
		if (!e) return;

		const id = String(o.nodeId);
		const now = Date.now();

		// Double-click (a click event with detail 2) = focus the camera on the object.
		if (e.type === 'click' && e.detail === 2) {
			window.editor.Focus(guid);
			return;
		}

		// Gameface port: like the Project tree, selection is bound to BOTH mousedown and
		// click for robustness (Gameface intermittently drops one or the other). To avoid
		// a Ctrl multi-select toggling twice, the `click` only acts as a FALLBACK: if we
		// already selected this exact node moments ago (from its paired mousedown), skip.
		if (e.type === 'click' && this.lastSelectId === id && now - this.lastSelectTime < 500) {
			return;
		}
		this.lastSelectId = id;
		this.lastSelectTime = now;

		if (e.shiftKey) {
			const selectedNode = this.tree.getNodeById(o.nodeId);
			window.editor.SelectMultiple(this.getConsecutiveNodesGuids(selectedNode));
		} else {
			window.editor.Select(guid, e.ctrlKey, false, true);
		}
		// Push the selection to Lua so the native selection box + gizmo appear (the 3D
		// pick path does this; a tree click must too, or nothing shows in the world).
		window.editor.threeManager.syncNativeSelection();
	}

	private lastSelectId: string | null = null;
	private lastSelectTime = 0;

	private getConsecutiveNodesGuids(newSelectedNode: Node): Guid[] {
		const guids = [];

		// Search for the first selected node that share parent with the newly selected node
		let firstNodeId: string | null = null;
		for (let i = 0; i < this.selected.length; i++) {
			const node = this.selected[i];
			if (node.parent.id === newSelectedNode.parent.id) {
				firstNodeId = node.id;
				break;
			}
		}
		let found = false;

		if (firstNodeId) {
			for (let j = 0; j < newSelectedNode.parent.children.length - 1; j++) {
				const node = newSelectedNode.parent.children[j];

				if (node.id === firstNodeId) {
					found = true;
					continue;
				}

				if (node.id === newSelectedNode.id) {
					break;
				}

				const isFiltered = this.infiniteTreeComponent.isNodeFiltered(node);

				if (found && !isFiltered) {
					guids.push(this.getNodeGuid(node));
				}
			}
		}
		// Add selected node
		guids.push(this.getNodeGuid(newSelectedNode));
		return guids;
	}

	private getNodeGuid(node: Node) {
		return Guid.parse(node.id.toString());
	}

	shouldSelectNode() {
		// TODO: logic to check if selectable
	}

	SpawnBlueprint(blueprint: Blueprint) {
		if (!blueprint) {
			return;
		}
		window.editor.SpawnBlueprint(blueprint);
	}

	private onObjectChanged(gameObject: GameObject, field: string, value: any) {
		if (!gameObject) {
			return;
		}
		if (field !== 'enabled' && field !== 'raycastEnabled' && field !== 'realm') {
			return;
		}
		const node: INode = this.tree.getNodeById(gameObject.guid.toString());
		if (!node || !node.content || !node.content[0]) {
			return;
		}
		// Gameface port: the tree nodes are marked non-reactive (_isVue) for perf, so a
		// plain `node.content[0].enabled = value` never re-renders the row — the eye icon
		// (eye <-> eye-crossed) and the disabled strikethrough would stay stale even though
		// the object really did hide/show in the world. Swap in a FRESH content object so
		// the slot's `:content` prop identity changes, then force the tree to re-render (the
		// same path selection uses). The slot's `enabled` computed then re-reads the value.
		node.content = [{ ...node.content[0], [field]: value }];
		this.forceTreeRerender();
	}

	// Bump the (non-reactive) tree's render version so the visible rows re-evaluate their
	// slot props. Used whenever we mutate node.content out-of-band (visibility / realm).
	private forceTreeRerender() {
		if (this.tree && typeof (this.tree as any).emit === 'function') {
			(this.tree as any).emit('contentWillUpdate');
		}
	}
}
</script>
<style lang="scss" scoped>
.expand {
	display: inline;
}
</style>
