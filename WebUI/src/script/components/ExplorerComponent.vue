<template>
	<gl-col>
		<gl-component id="explorer-component" :title="title">
			<div class="header">
				<input type="text" v-model="search" placeholder="Search">
			</div>
			<InfiniteTreeComponent class="scrollable datafont" ref="tree" :search="search" :autoOpen="true" :data="treeData" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
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
import { Guid } from '@/script/types/Guid';
import Highlighter from '@/script/components/widgets/Highlighter.vue';
import ListComponent from '@/script/components/ListComponent.vue';
import InfiniteTree, { Node, INode } from 'infinite-tree';

@Component({ components: { InfiniteTreeComponent, ListComponent, Highlighter } })

export default class ExplorerComponent extends EditorComponent {
	@Prop() public title: string;

	private treeData: INode = {
		'type': 'folder',
		'name': 'Venice',
		'id': 'Venice',
		'children': []
	};

	private list: Blueprint[] = [];
	private selected: Node | null;

	private search: string = '';

	constructor() {
		super();
		signals.blueprintsRegistered.connect(this.onBlueprintRegistered.bind(this));
	}

	public mounted() {
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

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		const data: INode = {
			'id': 'root',
			'type': 'folder',
			'name': 'Venice',
			'children': []
		};
		// TODO: Make sure this works after the new blueprint shit.
		for (const instance of blueprints) {
			const path = instance.name;
			const paths = getPaths(path);
			let parentPath: INode = data;
			const fileName = getFilename(path);
			let currentPath = '';
			paths.forEach((subPath) => {
				currentPath += subPath + '/';
				if (parentPath === undefined) {
					console.error('Missing parent path?');
				}
				if (parentPath.children === undefined) {
					console.error('Missing child field?');
					return;
				}
				const parentIndex = parentPath.children.find((x) => x.name.toLowerCase() === subPath.toLowerCase());
				if (parentIndex === undefined) {
					const a = parentPath.children.push({
						'id': Guid.create().toString(),
						'name': subPath,
						'type': 'folder',
						'children': [],
						'path': currentPath
					});
					if (parentPath.children[a - 1] !== undefined) {
						parentPath = parentPath.children[a - 1];
					} else {
						console.error('Missing parent path');
					}
				} else {
					parentPath = parentIndex;
					// Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
					// Replace lowercase paths with the actual case.
					if (hasUpperCase(subPath) && hasLowerCase(parentPath.name)) {
						parentPath.name = subPath;
					}
				}
			});
			if (parentPath.content === undefined) {
				parentPath.content = [];
			}
			parentPath.content.push(instance);
		}
		this.treeData = data;
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
