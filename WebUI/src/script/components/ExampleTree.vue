<template>
	<InfiniteTreeComponent class="scrollable" ref="tree" :data="data" :auto-open="true" :selectable="true" :tab-index="0" class-name="tree" :load-nodes="loadNodes" :should-load-nodes="shouldLoadNodes" :should-select-node="shouldSelectNode" :on-content-did-update="onContentDidUpdate" :on-content-will-update="onContentWillUpdate" :on-open-node="onOpenNode" :on-close-node="onCloseNode" :on-select-node="onSelectNode" :on-will-open-node="onWillOpenNode" :on-will-close-node="onWillCloseNode" :on-will-select-node="onWillSelectNode" :on-key-down="onKeyDown" :on-key-up="onKeyUp">
		<template slot-scope="{ node, index, tree, active }">
			<div :style="nodeStyle(node)" @click="clickNode($event,node,tree)">{{ node.name }}</div>
		</template>
	</InfiniteTreeComponent>
</template>

<script lang="ts">
// This is a tree example.

import { Component, Prop, Ref, Vue } from 'vue-property-decorator';
import { ITreeNode } from '@/script/interfaces/ITreeNode';
import { InfiniteTree } from '../../../types/InfiniteTree';
import InfiniteTreeComponent from './InfiniteTreeComponent.vue';

const generate = (size = 1000) => {
	const data = [];
	const source = '{"id":"<root>","name":"<root>","props":{"droppable":true},"children":[{"id":"alpha","name":"Alpha","props":{"droppable":true}},{"id":"bravo","name":"Bravo","props":{"droppable":true},"children":[{"id":"charlie","name":"Charlie","props":{"droppable":true},"children":[{"id":"delta","name":"Delta","props":{"droppable":true},"children":[{"id":"echo","name":"Echo","props":{"droppable":true}},{"id":"foxtrot","name":"Foxtrot","props":{"droppable":true}}]},{"id":"golf","name":"Golf","props":{"droppable":true}}]},{"id":"hotel","name":"Hotel","props":{"droppable":true},"children":[{"id":"india","name":"India","props":{"droppable":true},"children":[{"id":"juliet","name":"Juliet","props":{"droppable":true}}]}]},{"id":"kilo","name":"Kilo","loadOnDemand":true,"props":{"droppable":true}}]}]}';
	for (let i = 0; i < size; ++i) {
		data.push(JSON.parse(source.replace(/"(id|name)":"([^"]*)"/g, '"$1": "$2.' + i + '"')));
	}
	return data;
};
@Component({ components: { InfiniteTreeComponent } })
export default class ExampleTree extends Vue {
	public tree: InfiniteTree;
	private data() {
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
	}
	private mounted() {
		console.log(this);
		this.tree = (this.$refs.tree as any).tree as InfiniteTree;
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
	private nodeStyle(node: ITreeNode) {
		return {
			'background': node.state.selected ? '#deecfd' : '#fff',
			'border': node.state.selected ? '1px solid #06c' : '1px solid #fff',
			'padding-left': (node.state.depth * 18).toString() + 'px'
		};
	}
	private clickNode(e: MouseEvent, node: ITreeNode, tree: any) {
		console.log(e);
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
		tree.selectNode(node);
		console.log('afterSelectNode' + new Date().getTime());
	}
	private loadNodes(parentNode: ITreeNode, done: boolean) {

	}
	private shouldLoadNodes(node: ITreeNode) {
		return !node.hasChildren() && node.loadOnDemand;
	}
	private shouldSelectNode(node: ITreeNode) { // Defaults to null
		if (!node || (node === (this.tree.getSelectedNode()))) {
			return false; // Prevent from deselecting the current node
		}
		return true;
	}
	private onUpdate(node: ITreeNode) {
		// In order to update dom in time, you can also use $forceUpdate directly.
	}
	private onKeyUp() {
		console.log('onKeyUp');
	}
	private onKeyDown() {
		console.log('onKeyDown');
	}
	private onMouseLeave() {
		console.log('onMouseLeave');
	}
	private onMouseEnter() {
		console.log('onMouseEnter');
	}
	private onContentWillUpdate() {
		console.log('onContentWillUpdate');
	}
	private onContentDidUpdate() {
		console.log('onContentDidUpdate');
		console.log(this.tree);
		this.onUpdate(this.tree.getSelectedNode());
	}
	private onOpenNode(node: ITreeNode) {
		console.log('onOpenNode:', node);
		this.onUpdate(node);
	}
	private onCloseNode(node: ITreeNode) {
		console.log('onCloseNode:', node);
		this.onUpdate(node);
	}
	private onSelectNode(node: ITreeNode) {
		console.log('onSelectNode:', node);
		this.onUpdate(node);
	}
	private onWillOpenNode(node: ITreeNode) {
		console.log('onWillOpenNode:', node);
	}
	private onWillCloseNode(node: ITreeNode) {
		console.log('onWillCloseNode:', node);
	}
	private onWillSelectNode(node: ITreeNode) {
		console.log('onWillSelectNode:', node);
	}
}

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
