<template>
	<gl-component id="explorer-component">
		<InfiniteTreeComponent class="scrollable" ref="tree" :data="data" :selectable="true" :should-select-node="shouldSelectNode" :on-select-node="onSelectNode">
			<template slot-scope="{ node, index, tree, active }">
				<div class="tree-node" :style="nodeStyle(node)" @click="clickNode($event,node,tree)">{{ node.name }}</div>
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

@Component({ components: { InfiniteTreeComponent } })

export default class ExplorerComponent extends EditorComponent {
	private tree: InfiniteTree | null = null;
	constructor() {
		super();
		signals.blueprintsRegistered.connect(this.onBlueprintRegistered.bind(this));
	}

	public mounted() {
		this.tree = (this.$refs.tree as any).tree as InfiniteTree;
	}

	private data() {
		return {
			data: [{
				id: 'parent',
				name: 'parent',
				props: {
					droppable: true
				},
				children: []
			}],
			node: null,
			tree: null
		};
	}

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		console.log(blueprints);
	}

	private nodeStyle(node: ITreeNode) {
		return {
			background: node.state.selected ? '#deecfd' : '#fff',
			border: node.state.selected ? '1px solid #06c' : '1px solid #fff',
			'padding-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	private clickNode(e: MouseEvent, node: ITreeNode, tree: InfiniteTree) {
		console.log(node);
	}

	private onSelectNode(node: ITreeNode) {
		console.log(node);
	}

	private shouldSelectNode(node: ITreeNode) {
		console.log(node);
	}
}
</script>
