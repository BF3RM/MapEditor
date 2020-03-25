<template >
	<div class="tree-node" :style="nodeStyle(node)" :class="node.state.selected ? 'selected' : 'unselected'" @click="SelectNode($event, node, tree)">
		<div class="expand-container" @click="ToggleNode($event,node,tree)">
			<img v-if="node.children.length > 0" :class="{ expanded: node.state.open }" :src="require(`@/icons/editor/ExpandChevronRight_16x.svg`)"/>
		</div>
		<Highlighter v-if="search !== ''" :text="node.name" :search="search"/>
		<span class="slot-text" v-else>
			{{ nodeText }}
		</span>
	</div>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import Highlighter from '@/script/components/widgets/Highlighter.vue';
import InfiniteTree, { Node, INode } from 'infinite-tree';

@Component({ components: { Highlighter } })
export default class ExpandableTreeSlot extends Vue {
	@Prop()
	node: Node;

	@Prop()
	tree: any;

	@Prop()
	search: any;

	@Prop()
	nodeText: String;

	private nodeStyle(node: Node) {
		if (node.state === undefined) {
			console.error('Missing node state: ' + node);
		}
		return {
			'margin-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	public SelectNode(e: MouseEvent, node: Node, tree: InfiniteTree) {
		tree.selectNode(node);
	}

	public ToggleNode(e: MouseEvent, node: Node, tree: InfiniteTree) {
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
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
}
</script>
<style lang="scss" scoped>
	.expand-container {
		width: 1.5vmin;
		height: 1.5vmin;
		color: #6d6d6d;

		img {
			max-width: 1.5vmin;
			max-height: 1.5vmin;

			&.expanded {
				transform: rotate(90deg);
			}
		}
	}
	.td{
		&:hover {
			background-color: #343434;
		}
	}
</style>
