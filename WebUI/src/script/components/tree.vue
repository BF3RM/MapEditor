<template>
	<InfiniteTree ref="tree" :data="data" :auto-open="true" :selectable="true" :tab-index="0" class-name="tree" :load-nodes="loadNodes" :should-load-nodes="shouldLoadNodes" :should-select-node="shouldSelectNode" :on-content-did-update="onContentDidUpdate" :on-content-will-update="onContentWillUpdate" :on-open-node="onOpenNode" :on-close-node="onCloseNode" :on-select-node="onSelectNode" :on-will-open-node="onWillOpenNode" :on-will-close-node="onWillCloseNode" :on-will-select-node="onWillSelectNode" :on-key-down="onKeyDown" :on-key-up="onKeyUp">
		<template slot-scope="{ node, index, tree, active }">
			<div :style="nodeStyle(node)" @click="clickNode($event,node,tree)">{{ node.name }}</div>
		</template>
	</InfiniteTree>
</template>

<script lang="ts">
import InfiniteTree from './infiniteTree';
import { TreeNode } from '@/script/interfaces/TreeNode';
// This is a tree example.

const generate = (size = 1000) => {
	const data = [];
	const source = '{"id":"<root>","name":"<root>","props":{"droppable":true},"children":[{"id":"alpha","name":"Alpha","props":{"droppable":true}},{"id":"bravo","name":"Bravo","props":{"droppable":true},"children":[{"id":"charlie","name":"Charlie","props":{"droppable":true},"children":[{"id":"delta","name":"Delta","props":{"droppable":true},"children":[{"id":"echo","name":"Echo","props":{"droppable":true}},{"id":"foxtrot","name":"Foxtrot","props":{"droppable":true}}]},{"id":"golf","name":"Golf","props":{"droppable":true}}]},{"id":"hotel","name":"Hotel","props":{"droppable":true},"children":[{"id":"india","name":"India","props":{"droppable":true},"children":[{"id":"juliet","name":"Juliet","props":{"droppable":true}}]}]},{"id":"kilo","name":"Kilo","loadOnDemand":true,"props":{"droppable":true}}]}]}';
	for (let i = 0; i < size; ++i) {
		data.push(JSON.parse(source.replace(/"(id|name)":"([^"]*)"/g, '"$1": "$2.' + i + '"')));
	}
	return data;
};
export default {
	name: 'tree',
	components: {
		InfiniteTree
	},
	data() {
		return {
			data: [ {
				id: 'parent',
				name: 'parent',
				props: {
					droppable: true
				},
				children: generate(100)
			} ],
			node: null,
			tree: null
		};
	},
	mounted() {
		this.tree = this.$refs.tree.tree;
	},
	methods: {
		toggleState(node: TreeNode) {
			const hasChildren = node.hasChildren();
			let toggleState = '';
			if ((!hasChildren && node.loadOnDemand) || (hasChildren && !node.state.open)) {
				toggleState = 'closed';
			}
			if (hasChildren && node.state.open) {
				toggleState = 'opened';
			}
			return toggleState;
		},
		nodeStyle(node: TreeNode) {
			return {
				'background': node.state.selected ? '#deecfd' : '#fff',
				'border': node.state.selected ? '1px solid #06c' : '1px solid #fff',
				'padding-left': (node.state.depth * 18).toString() + 'px'
			};
		},
		clickNode(e:MouseEvent, node: TreeNode, tree: any) {
			console.log(e);
			let toggleState = this.toggleState(node);
			if (toggleState === 'closed') {
				tree.openNode(node);
			} else if (toggleState === 'opened') {
				tree.closeNode(node);
			}
			tree.selectNode(node);
			console.log('afterSelectNode' + new Date().getTime());
		},
		loadNodes(parentNode: TreeNode, done:boolean) {

		},
		shouldLoadNodes(node: TreeNode) {
			return !node.hasChildren() && node.loadOnDemand;
		},
		shouldSelectNode(node:TreeNode) { // Defaults to null
			if (!node || (node === this.$refs.tree.tree.getSelectedNode())) {
				return false; // Prevent from deselecting the current node
			}
			return true;
		},
		onUpdate(node:TreeNode) {
			// In order to update dom in time, you can also use $forceUpdate directly.
			this.node = node;
		},
		onKeyUp() {
			console.log('onKeyUp');
		},
		onKeyDown() {
			console.log('onKeyDown');
		},
		onMouseLeave() {
			console.log('onMouseLeave');
		},
		onMouseEnter() {
			console.log('onMouseEnter');
		},
		onContentWillUpdate() {
			console.log('onContentWillUpdate');
		},
		onContentDidUpdate() {
			console.log('onContentDidUpdate');
			console.log(this.tree);
			this.onUpdate(this.$refs.tree.tree.getSelectedNode());
		},
		onOpenNode(node: TreeNode) {
			console.log('onOpenNode:', node);
			this.onUpdate(node);
		},
		onCloseNode(node: TreeNode) {
			console.log('onCloseNode:', node);
			this.onUpdate(node);
		},
		onSelectNode(node: TreeNode) {
			console.log('onSelectNode:', node);
			this.onUpdate(node);
		},
		onWillOpenNode(node: TreeNode) {
			console.log('onWillOpenNode:', node);
		},
		onWillCloseNode(node: TreeNode) {
			console.log('onWillCloseNode:', node);
		},
		onWillSelectNode(node: TreeNode) {
			console.log('onWillSelectNode:', node);
		}
	}
};
</script>

<style lang="scss" scoped>
	.tree {
		width: 100%;
		height: 100%;
	}
	.tree-node{
		cursor: default;
		position: relative;
		&:hover {
			background: #f2fdff;
		}
	}
	.tree-text{
		margin-left: 2px;
		user-select: none;
	}
	.icon-load{
		animation: ani-demo-spin 1s linear infinite;
	}
	@keyframes ani-demo-spin {
		from { transform: rotate(0deg);}
		50%  { transform: rotate(180deg);}
		to   { transform: rotate(360deg);}
	}
</style>
