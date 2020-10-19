<template>
	<gl-row>
		<gl-col>
			<EditorComponent id="explorer-component" title="Project">
				<div class="header">
					<Search v-model="search"/>
				</div>
				<infinite-tree-component class="scrollable datafont" ref="it" :search="search" :autoOpen="false" :data="treeData" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
					<expandable-tree-slot slot-scope="{ node, index, tree, active }" :node="node" :tree="tree" :search="search" :nodeText="node.name" :selected="node.state.selected"/>
				</infinite-tree-component>
			</EditorComponent>
		</gl-col>
		<gl-col>
			<ListComponent class="datafont" title="Project Data" :list="list" :keyField="'instanceGuid'" :headers="['Name', 'Type']" :click="SpawnBlueprint">
				<template slot-scope="{ item, data }" >
					<Highlighter class="td" :text="cleanPath(item.name)" :search="search"/><div class="td">{{item.typeName}}</div>
				</template>
			</ListComponent>
		</gl-col>
	</gl-row>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from '@/script/components/EditorComponents/EditorComponent.vue';
import InfiniteTreeComponent from '@/script/components/InfiniteTreeComponent.vue';
import { signals } from '@/script/modules/Signals';
import { Blueprint } from '@/script/types/Blueprint';
import { getFilename, getPaths, hasLowerCase, hasUpperCase } from '@/script/modules/Utils';
import { Guid } from '@/script/types/Guid';
import Highlighter from '@/script/components/widgets/Highlighter.vue';
import ListComponent from '@/script/components/EditorComponents/ListComponent.vue';
import InfiniteTree, { Node, INode } from 'infinite-tree';
import Search from '@/script/components/widgets/Search.vue';
import ExpandableTreeSlot from '@/script/components/EditorComponents/ExpandableTreeSlot.vue';

@Component({ components: { ExpandableTreeSlot, EditorComponent, InfiniteTreeComponent, ListComponent, Highlighter, Search } })

export default class ExplorerComponent extends EditorComponent {
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

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		const scope = this;
		return new Promise((resolve, reject) => {
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
			resolve(data);
		}).then((data) => {
			scope.treeData = data as INode;
		});
	}

	private onSelectNode(node: Node) {
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
		// this.selected.state.selected = true;
		this.$set(node.state, 'enabled', true);
		this.$set(node.state, 'selected', true);
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
	.td {
		padding: 0.3vmin;
		&:hover {
			background-color: #343434;
		}
	}
</style>
