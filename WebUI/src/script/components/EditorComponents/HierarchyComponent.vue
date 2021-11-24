<template>
		<EditorComponent id="explorer-component" title="Scene Instances">
			<div class="header">
				<Search v-model="search"/>
			</div>
			<infinite-tree-component class="scrollable datafont"
									ref="infiniteTreeComponent"
									:search="search"
									:autoOpen="true"
									:data="data"
									:selectable="true"
									:row-height="13"
									:should-select-node="shouldSelectNode">
				<expandable-tree-slot slot-scope="{ node, index, tree, active }"
									:has-visibility-options="true"
									:node="node"
									:tree="tree"
									:search="search"
									:content="node.content"
									:nodeText="nodeText(node)"
									:selected="node.state.selected"
									@node:toggle-enable="onNodeToggleEnable"
									@node:toggle-raycast-enable="onNodeToggleRaycastEnable"
									@node:hover="onNodeHover"
									@node:hover-end="onNodeHoverEnd"
									@node:click="onNodeClick" />
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

@Component({ components: { InfiniteTreeComponent, ListComponent, Highlighter, Search, ExpandableTreeSlot, EditorComponent } })

export default class HierarchyComponent extends EditorComponent {
	private data: INode[] = [{
		'type': 'folder',
		'name': 'Vanilla',
		'id': 'vanilla_root',
		'children': [],
		'content': [{
			'enabled': true,
			'raycastEnabled': true,
			'realm': REALM.CLIENT_AND_SERVER
		}]
	}, {
		'type': 'folder',
		'name': 'Custom',
		'id': 'custom_root',
		'children': [],
		'content': [{
			'enabled': true,
			'raycastEnabled': true,
			'realm': REALM.CLIENT_AND_SERVER
		}]
	}];

	private tree: InfiniteTree;
	private list: Blueprint[] = [];
	private selected: Node[] = [];

	private search: string = '';

	private queue = new Map<string, INode>();
	private existingParents = new Map<string, INode[]>();

	@Ref('infiniteTreeComponent')
	infiniteTreeComponent: any;

	constructor() {
		super();
		console.log('Mounted');
		signals.spawnedGameObject.connect(this.onSpawnedGameObject.bind(this));
		signals.deletedGameObject.connect(this.onDeletedGameObject.bind(this));
		// signals.enabledGameObject.connect(this.onEnabledBlueprint.bind(this));
		// signals.disabledGameObject.connect(this.onDisabledBlueprint.bind(this));
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
		signals.deselectedGameObject.connect(this.onDeselectedGameObject.bind(this));
		signals.objectChanged.connect(this.onObjectChanged.bind(this));
	}

	public mounted() {
		if (this.infiniteTreeComponent !== undefined) {
			this.tree = (this.infiniteTreeComponent).tree as InfiniteTree;
		}
	}

	private createNode(gameObject: GameObject): INode {
		return {
			id: gameObject.guid.toString(),
			name: gameObject.getCleanName(),
			type: gameObject.blueprintCtrRef.typeName,
			children: [],
			content: [{
				parentGuid: gameObject.parentData.guid,
				enabled: gameObject.enabled,
				raycastEnabled: gameObject.raycastEnabled,
				realm: gameObject.realm
			}]
		};
	}

	nodeText(node: Node) {
		return (node.children.length === 0) ? node.name : node.name + ' (' + node.children.length + ')';
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
					const rootId = gameObject.origin === GAMEOBJECT_ORIGIN.VANILLA ? 'vanilla_root' : 'custom_root';
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
			const nodeIndex = (this.selected).findIndex((i) => {
				// console.log(i.id === node.id);
				return i.id === node.id;
			});
			this.selected.splice(nodeIndex, 1);
		}
	}

	private onNodeToggleEnable(node: Node) {
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

	private onNodeToggleRaycastEnable(node: Node) {
		if (!node.content || !node.content[0]) {
			return;
		}
		const guid = Guid.parse(node.id.toString());
		if (guid.isEmpty()) return;

		window.editor.ToggleRaycastEnabled(guid, !node.content[0].raycastEnabled);
	}

	private onNodeHover(nodeId: string) {
		const guid = Guid.parse(nodeId.toString());
		if (guid.isEmpty()) return;
		window.editor.editorCore.highlight(guid);
	}

	private onNodeHoverEnd() {
		window.editor.editorCore.unhighlight();
	}

	private onNodeClick(o: any) {
		const guid = Guid.parse(o.nodeId.toString());

		if (guid.isEmpty()) return;

		if (o.event.detail === 1) {
			// Click
			if (o.event.shiftKey) {
				const selectedNode = this.tree.getNodeById(o.nodeId);
				window.editor.SelectMultiple(this.getConsecutiveNodesGuids(selectedNode));
			} else {
				window.editor.Select(guid, o.event.ctrlKey, false, true);
			}
		} else if (o.event.detail === 2) {
			// Double Click
			window.editor.Focus(guid);
		}
	}

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

				if (found) {
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

	private shouldSelectNode(node: Node) {
		// TODO: logic to check if selectable
	}

	private SpawnBlueprint(blueprint: Blueprint) {
		if (!blueprint) {
			return;
		}
		window.editor.SpawnBlueprint(blueprint);
	}

	private onObjectChanged(gameObject: GameObject, field: string, value: any) {
		if (!gameObject) {
			return;
		}
		if (field === 'enabled') {
			const node: INode = this.tree.getNodeById(gameObject.guid.toString());
			if (node) {
				if (node.content && node.content[0]) {
					node.content[0].enabled = value;
				}
			}
		}

		if (field === 'raycastEnabled') {
			const node: INode = this.tree.getNodeById(gameObject.guid.toString());
			if (node) {
				if (node.content && node.content[0]) {
					node.content[0].raycastEnabled = value;
				}
			}
		}

		if (field === 'realm') {
			const node: INode = this.tree.getNodeById(gameObject.guid.toString());
			if (node) {
				if (node.content && node.content[0]) {
					node.content[0].realm = value;
				}
			}
		}
	}
}
</script>
<style lang="scss" scoped>
	.expand {
		display: inline;
	}
</style>
