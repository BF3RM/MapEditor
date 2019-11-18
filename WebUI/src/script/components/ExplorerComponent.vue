<template>
	<gl-component id="explorer-component">
		<InfiniteTreeComponent class="scrollable" ref="tree" :data="data" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
			<template slot-scope="{ node, index, tree, active }">
				<div class="tree-node" :style="nodeStyle(node)" @click="clickNode($event,node,tree)">{{ node.text }}</div>
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

@Component({ components: { InfiniteTreeComponent } })

export default class ExplorerComponent extends EditorComponent {
	private tree: InfiniteTree | null = null;
	private data: ITreeNode = {
		'type': 'folder',
		'text': 'Venice',
		'state': {
			'opened': true,
			'selected': true
		},
		'children': [],
		'content': []
	} as ITreeNode;

	constructor() {
		super();
		signals.blueprintsRegistered.connect(this.onBlueprintRegistered.bind(this));
	}

	public mounted() {
		this.tree = (this.$refs.tree as any).tree as InfiniteTree;
	}

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		const data :ITreeNode = {
			'id': 'root',
			'type': 'folder',
			'text': 'Venice',
			'state': {
				'opened': true,
				'selected': true
			},
			'children': [],
			'content': []
		} as ITreeNode;
		// TODO: Make sure this works after the new blueprint shit.
		for (const key in blueprints) {
			const instance = blueprints[key];
			const path = instance.name;
			const paths = getPaths(path);
			let parentPath: {type: string, text: string, children: any[], content: any[]} = data;
			const fileName = getFilename(path);
			paths.forEach(function (subPath) {
				const parentIndex = parentPath.children.find(x => x.text.toLowerCase() === subPath.toLowerCase());
				if (parentIndex === undefined) {
					const a = parentPath.children.push({
						'type': 'folder',
						'id': Guid.create().toString(),
						'text': subPath,
						'children': [],
						'content': []
					} as ITreeNode);
					parentPath = parentPath.children[a - 1];
				} else {
					parentPath = parentIndex;
					// Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
					// Replace lowercase paths with the actual case.
					if (hasUpperCase(subPath) && hasLowerCase(parentPath.text)) {
						parentPath.text = subPath;
					}
				}
			});
			parentPath.content.push({
				'type': 'file',
				'text': fileName,
				'id': key
			});
		}
		this.data = data;
	}

	private nodeStyle(node: ITreeNode) {
		return {
			'background': node.state.selected ? '#deecfd' : '#fff',
			'border': node.state.selected ? '1px solid #06c' : '1px solid #fff',
			'padding-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	public clickNode(e: MouseEvent, node: ITreeNode, tree: InfiniteTree) {
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
		tree.selectNode(node);
	}

	private toggleState(node: ITreeNode) {
		const hasChildren = node.hasChildren();
		let toggleState = '';
		if ((!hasChildren && node.loadOnDemand) || (hasChildren && !node.state.open)) {
			toggleState = 'closed';
		}
		if (hasChildren && node.state.open) {
			toggleState = 'opened';
		}
		return toggleState;
	}

	private onSelectNode(node: ITreeNode) {
		console.log(node);
	}

	private shouldSelectNode(node: ITreeNode) {
		return true;
	}
}
</script>
