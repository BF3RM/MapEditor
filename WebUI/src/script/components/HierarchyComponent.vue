<template>
	<gl-col>
		<gl-component id="explorer-component" :title="title">
			<div class="header">
				<input type="text" v-model="search" placeholder="Search">
			</div>
			<InfiniteTreeComponent class="scrollable datafont" ref="tree" :search="search" :autoOpen="true" :data="data" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
				<template slot-scope="{ node, index, tree, active }" selected="node.selected">
					<div class="tree-node" :style="nodeStyle(node)" :class="node.state.selected ? 'selected' : 'unselected'" @click="SelectNode($event, node, tree)">
						<div class="expand" @click="ToggleNode($event,node,tree)">
							<div v-if="node.state.open && node.children.length > 0">
								v
							</div>
							<div v-if="!node.state.open && node.children.length > 0">
								>
							</div>
						</div>
						<Highlighter v-if="search !== ''" :text="node.name" :search="search"/>
						<span v-else>
							{{ node.name }}
						</span>
					</div>
				</template>
			</InfiniteTreeComponent>
		</gl-component>
		<ListComponent class="datafont" title="Explorer data" :list="list" :keyField="'instanceGuid'" :headers="['name', 'type']" :click="SpawnBlueprint">
			<template slot-scope="{ item, data }">
				<Highlighter class="td" :text="cleanPath(item.name)" :search="search"/><div class="td">{{item.typeName}}</div>
			</template>
		</ListComponent>
	</gl-col>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from '@/script/components/EditorComponent.vue';
import InfiniteTreeComponent from '@/script/components/InfiniteTreeComponent.vue';
import { signals } from '@/script/modules/Signals';
import { Blueprint } from '@/script/types/Blueprint';
import { getFilename, getPaths, hasLowerCase, hasUpperCase } from '@/script/modules/Utils';
import Highlighter from './widgets/Highlighter.vue';
import ListComponent from '@/script/components/ListComponent.vue';
import { InfiniteTree, Node, INode } from 'infinite-tree';
import { CommandActionResult } from '@/script/types/CommandActionResult';
import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';

@Component({ components: { InfiniteTreeComponent, ListComponent, Highlighter } })

export default class HierarchyComponent extends EditorComponent {
	@Prop() public title: string;
	private data: INode = {
		'type': 'folder',
		'name': 'root',
		'id': 'root',
		'children': []
	};

	private tree: InfiniteTree;
	private list: Blueprint[] = [];
	private selected: Node | null;

	private search: string = '';

	private entries: Node[] = [];
	private queue: INode[] = [];
	private existingParents: INode[] = [];

	constructor() {
		super();
	}

	public mounted() {
		signals.spawnedBlueprint.connect(this.onSpawnedBlueprint.bind(this));
		this.tree = (this.$refs.tree as InfiniteTreeComponent).tree;
	}

	private createNode(gameObject: GameObject): INode {
		return {
			id: gameObject.guid.toString(),
			name: gameObject.getCleanName(),
			type: gameObject.typeName,
			children: [],
			data: {
				parentGuid: gameObject.parentData.guid.toString()
			}
		};
	}

	onSpawnedBlueprint(commandActionResult: CommandActionResult) {
		const gameObjectGuid = commandActionResult.gameObjectTransferData.guid;
		console.log(gameObjectGuid);
		const gameObject = (window as any).editor.getGameObjectByGuid(gameObjectGuid);

		const currentEntry = this.createNode(gameObject);
		this.entries[gameObjectGuid] = currentEntry as Node;
		this.queue[currentEntry.id] = currentEntry;

		if (!(window as any).editor.vext.executing) {
			console.log('Drawing');
			console.log(Object.keys(this.queue).length);

			const updatedNodes = {};

			for (const entryGuid in this.queue) {
				const entry = this.queue[entryGuid];
				// Check if the parent is in the queue
				if (this.queue[entry.data.parentGuid]) {
					this.queue[entry.data.parentGuid].children.push(entry);
					// Check if the parent node is already spawned
				} else if ((this.$refs.tree as InfiniteTreeComponent).tree.getNodeById(entry.data.parentGuid) != null) {
					if (this.existingParents[entry.data.parentGuid] == null) {
						this.existingParents[entry.data.parentGuid] = [];
					}
					console.log('Existing' + entry.name);
					this.existingParents[entry.data.parentGuid].push(entry);
				} else {
					if ((this.existingParents as any).root == null) {
						(this.existingParents as any).root = [];
					}
					console.log('Root');
					(this.existingParents as any).root.push(entry);
				}
			}
			for (const parentNode of this.existingParents) {
				if (this.entries[parentNode.id] === undefined) {
					console.error('Missing parent node');
				} else {
					this.tree.addChildNodes(this.existingParents[parentNode.id], undefined, this.entries[parentNode.id]);
				}
				delete this.existingParents[parentNode.id];
			}
			this.queue = [];
		}
	}

	public ToggleNode(e: MouseEvent, node: Node, tree: InfiniteTree) {
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
	}

	public SelectNode(e: MouseEvent, node: Node, tree: InfiniteTree) {
		tree.selectNode(node);
	}

	private nodeStyle(node: Node) {
		if (node.state === undefined) {
			console.error('Missing node state: ' + node);
		}
		return {
			'margin-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	private toggleState(node: Node) {
		const hasChildren = node.children.length > 0;
		let toggleState = '';
		if ((!hasChildren && node.loadOnDemand) || (hasChildren && !node.state.open)) {
			toggleState = 'closed';
		}
		if (hasChildren && node.state.open) {
			toggleState = 'opened';
		}
		return toggleState;
	}

	onSelectedGameObject(guid: Guid, isMultipleSelection?: boolean, scrollTo?: boolean) {
		const currentNode = this.tree.getNodeById(guid.toString());

		currentNode.state.selected = true;
		this.tree.updateNode(currentNode, {}, { shallowRendering: false });
		if (scrollTo) {
			(this.$refs.tree as InfiniteTreeComponent).scrollTo(currentNode);
		}
	}

	private onSelectNode(node: Node) {
		console.log('onSelect');

		if (node === null) {
			this.list = [];
			this.selected = null;
			return;
		}
		this.list = this.getBlueprintsRecursive(node);
		if (this.selected) {
			this.selected.state.selected = false;
		}
		this.selected = node;
		this.selected.state.selected = true;
		this.$set(node.state, 'enabled', true);
		console.log(node);
	}

	private getBlueprintsRecursive(node: Node): Blueprint[] {
		let list: Blueprint[] = node.content as Blueprint[];
		if (list === undefined) {
			list = [];
		}

		node.children.forEach((child) => {
			list = list.concat(this.getBlueprintsRecursive(child));
		});
		return list;
	}

	private cleanPath(path: string) {
		if (!this.selected) {
			return path;
		}
		return path.replace(this.selected.path, '');
	}

	private shouldSelectNode(node: Node) {
		console.log('ShouldSelect');
		return window.editor.Select(Guid.parse(node.id));
	}

	private SpawnBlueprint(blueprint: Blueprint) {
		if (!blueprint) {
			return;
		}
		window.editor.SpawnBlueprint(blueprint);
	}
}
</script>
<style lang="scss" scoped>
	.expand {
		display: inline;
	}
	.selected {
		background-color: #404040;
	}
	.tree-node {
		font-family: Overpass Mono, sans-serif;
	}
	.tree-node {
		display: flex;
	}
	.expand div {
		width: 10px;
		color: #6d6d6d;
	}
</style>
