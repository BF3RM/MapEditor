<template>
	<gl-col>
		<gl-component id="explorer-component">
			<div class="header">
				<input type="text" v-model="search">
			</div>
			<InfiniteTreeComponent class="scrollable datafont" ref="tree" :search="search" :autoOpen="true" :data="data" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
				<template slot-scope="{ node, index, tree, active }">
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
							{{ node.name }} - {{ node.content.length }}
						</span>
					</div>
				</template>
			</InfiniteTreeComponent>
		</gl-component>
		<ListComponent class="datafont" title="Explorer data" :list="list" :keyField="'instanceGuid'" :headers="['name', 'type']" :click="SpawnBlueprint">
			<template slot-scope="{ item, data }">
				<Highlighter class="td" :text="cleanPath(item.name)" :search="data.search"/><div class="td">{{item.typeName}}</div>
			</template>
		</ListComponent>
	</gl-col>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import InfiniteTreeComponent from './InfiniteTreeComponent.vue';
import { ITreeNode } from '../interfaces/ITreeNode';
import { signals } from '../modules/Signals';
import { Blueprint } from '../types/Blueprint';
import { getFilename, getPaths, hasLowerCase, hasUpperCase } from '../modules/Utils';
import { Guid } from 'guid-typescript';
import { TreeNode } from '../types/TreeNode';
import Highlighter from './widgets/Highlighter.vue';
import ListComponent from './ListComponent.vue';
import { InfiniteTree } from 'infinite-tree';

@Component({ components: { InfiniteTreeComponent, ListComponent, Highlighter } })

export default class HierarchyComponent extends EditorComponent {
	private tree: InfiniteTree | null = null;
	private data: TreeNode = new TreeNode({
		'type': 'folder',
		'name': 'Venice',
		'id': 'Venice',
		'path': '/',
		'state': {
			'opened': true,
			'selected': true,
			'depth': 0
		}
	} as ITreeNode);

	private list: Blueprint[] = [];
	private selected!: TreeNode | null;

	private search: string = '';

	constructor() {
		super();
	}

	public mounted() {
		this.tree = (this.$refs.tree as any).tree as InfiniteTree;
	}

	public ToggleNode(e: MouseEvent, node: TreeNode, tree: InfiniteTree) {
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
	}

	public SelectNode(e: MouseEvent, node: TreeNode, tree: InfiniteTree) {
		tree.selectNode(node);
	}

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		const data: TreeNode = new TreeNode({
			'id': 'root',
			'type': 'folder',
			'name': 'Venice',
			'path': '/',
			'state': {
				'opened': true,
				'depth': 0
			},
			'children:': []
		} as ITreeNode);
		// TODO: Make sure this works after the new blueprint shit.
		for (const instance of blueprints) {
			const path = instance.name;
			const paths = getPaths(path);
			let parentPath: TreeNode = data;
			const fileName = getFilename(path);
			let currentPath = '';
			paths.forEach((subPath) => {
				currentPath += subPath + '/';
				const parentIndex = parentPath.children.find((x) => x.name.toLowerCase() === subPath.toLowerCase());
				if (parentIndex === undefined) {
					const a = parentPath.children.push(new TreeNode({
						'id': Guid.create().toString(),
						'name': subPath,
						'type': 'folder',
						'path': currentPath,
						'children': []
					} as ITreeNode));
					parentPath = parentPath.children[a - 1];
				} else {
					parentPath = parentIndex;
					// Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
					// Replace lowercase paths with the actual case.
					if (hasUpperCase(subPath) && hasLowerCase(parentPath.name)) {
						parentPath.name = subPath;
					}
				}
			});
			parentPath.content.push(instance);
		}
		this.data = data;
	}

	private nodeStyle(node: TreeNode) {
		return {
			'margin-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	private toggleState(node: TreeNode) {
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

	private onSelectNode(node: TreeNode) {
		console.log('onSelect');

		if (node === null) {
			this.list = [];
			this.selected = null;
			return;
		}
		this.selected = node;
		this.list = this.getBlueprintsRecursive(node);
	}

	private getBlueprintsRecursive(node: TreeNode): Blueprint[] {
		let list: Blueprint[] = node.content;
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

	private shouldSelectNode(node: TreeNode) {
		console.log('ShouldSelect');
		return true;
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
