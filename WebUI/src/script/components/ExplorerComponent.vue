<template>
	<gl-component id="explorer-component">
		<div class="header">
			<input type="text" v-model="search">
		</div>
		<InfiniteTreeComponent class="scrollable" ref="tree" :search="search" :autoOpen="true" :data="data" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
			<template slot-scope="{ node, index, tree, active }">
				<div class="tree-node" :style="nodeStyle(node)" :class="node.state.selected ? 'selected' : 'unselected'" @click="clickNode($event,node,tree)">
					<div v-if="node.children.length > 0" class="expand">
						<span v-if="node.state.open">
							v
						</span>
						<span v-if="!node.state.open">
							>
						</span>
					</div>
					<Highlighter v-if="search !== ''" :text="node.name" :search="search"/>
					<span v-else>
						{{ node.name }}
					</span>
				</div>
			</template>
		</InfiniteTreeComponent>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import InfiniteTreeComponent from './InfiniteTreeComponent.vue';
import { InfiniteTree } from '../../../types/libs/InfiniteTree';
import { ITreeNode } from '@/script/interfaces/ITreeNode';
import { signals } from '@/script/modules/Signals';
import { Blueprint } from '@/script/types/Blueprint';
import { getFilename, getPaths, hasLowerCase, hasUpperCase } from '@/script/modules/Utils';
import { Guid } from 'guid-typescript';
import { TreeNode } from '@/script/types/TreeNode';
import Highlighter from '@/script/components/widgets/Highlighter';

@Component({ components: { InfiniteTreeComponent, Highlighter } })

export default class ExplorerComponent extends EditorComponent {
	private tree: InfiniteTree | null = null;
	private data: TreeNode = new TreeNode({
		'type': 'folder',
		'name': 'Venice',
		'id': 'Venice',
		'state': {
			'opened': true,
			'selected': true,
			'depth': 0
		}
	} as ITreeNode);

	private search: string = '';

	constructor() {
		super();
		signals.blueprintsRegistered.connect(this.onBlueprintRegistered.bind(this));
	}

	public mounted() {
		this.tree = (this.$refs.tree as any).tree as InfiniteTree;
	}

	public clickNode(e: MouseEvent, node: TreeNode, tree: InfiniteTree) {
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
		tree.selectNode(node);
	}

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		const data: TreeNode = new TreeNode({
			'id': 'root',
			'type': 'folder',
			'name': 'Venice',
			'state': {
				'opened': true,
				'selected': true,
				'depth': 0
			}
		} as ITreeNode);
		// TODO: Make sure this works after the new blueprint shit.
		for (const instance of blueprints) {
			const path = instance.name;
			const paths = getPaths(path);
			let parentPath: TreeNode = data;
			const fileName = getFilename(path);
			paths.forEach((subPath) => {
				const parentIndex = parentPath.children.find((x) => x.name.toLowerCase() === subPath.toLowerCase());
				if (parentIndex === undefined) {
					const a = parentPath.children.push(new TreeNode({
						'id': Guid.create().toString(),
						'name': subPath,
						'type': 'folder'
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
			parentPath.content.push(new TreeNode({
				'id': instance.instanceGuid.toString(),
				'name': fileName,
				'type': 'file'
			} as ITreeNode));
		}
		this.data = data;
	}

	private nodeStyle(node: TreeNode) {
		return {
			'padding-left': (node.state.depth * 18).toString() + 'px'
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
	}

	private shouldSelectNode(node: TreeNode) {
		console.log('ShouldSelect');
		return true;
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
</style>
