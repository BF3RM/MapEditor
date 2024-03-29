<template>
	<RecycleScroller
		:class="className"
		class="scrollable"
		:items="filteredNodes"
		ref="scroller"
		:min-item-size="16"
		:item-size="rowHeight"
		:buffer="50"
	>
		<div slot-scope="{ item, index }">
			<slot
				class="text-slot"
				v-bind="{
					node: item,
					tree: tree,
					index: index,
					data: data
				}"
			/>
		</div>
	</RecycleScroller>
</template>

<script lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import InfiniteTree, { Node } from 'infinite-tree';
import { Component, Prop, Ref, Vue, Watch } from 'vue-property-decorator';

const lcfirst = (str: string) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};
@Component({ components: { RecycleScroller } })
export default class InfiniteTreeComponent extends Vue {
	@Ref('scroller')
	scroller: RecycleScroller;

	@Prop()
	search: string;

	@Prop({ default: 'scroll-box' })
	className: string;

	@Prop({ default: true })
	autoOpen: boolean;

	@Prop({ default: true })
	selectable: boolean;

	@Prop({ default: 0 })
	tabIndex: number;

	@Prop({ default: [] })
	data: object[];

	@Prop({ default: 32 })
	rowHeight: number;

	@Prop({ default: true })
	loadNodes: boolean;

	@Prop({
		type: Function,
		default() {
			return true;
		}
	})
	getNodeById: () => boolean;

	@Prop({
		type: Function,
		default(node: Node) {
			return (this as any).scrollTo(node);
		}
	})
	public scrollToNode: () => void;

	@Prop({
		type: Function,
		default(node: Node) {
			console.log('ShouldLoadNodes');
			return !(node.children.length > 0) && node.loadOnDemand;
		}
	})
	shouldLoadNodes: boolean;

	@Prop({
		type: Function,
		default(node: Node) {
			if (!node || node === (this as any).tree.getSelectedNode()) {
				return false; // Prevent from deselecting the current node
			}
			return true;
		}
	})
	shouldSelectNode: boolean;

	// @Prop({ type: Function }) onContentWillUpdate: void;
	// @Prop({ type: Function }) onContentDidUpdate: void;
	// @Prop({ type: Function }) onOpenNode: void;
	// @Prop({ type: Function }) onCloseNode: void;
	@Prop({ type: Function }) onSelectNode: void;
	// @Prop({ type: Function }) onWillOpenNode: void;
	// @Prop({ type: Function }) onWillCloseNode: void;
	// @Prop({ type: Function }) onWillSelectNode: void;
	// @Prop({ type: Function }) onKeyUp: void;
	// @Prop({ type: Function }) onKeyDown: void;
	// @Prop({ type: Function }) onMouseLeave: void;
	// @Prop({ type: Function }) onMouseEnter: void;

	@Watch('data')
	onDataChange(newValue: any) {
		console.log('datachange');
		this.tree.loadData(newValue);
	}

	@Watch('search')
	onSearchChange(newValue: string) {
		console.log('Search: ' + newValue);
		if (newValue === '') {
			this.tree.unfilter();
		}
		this.tree.filter(newValue);

		// When the search changes, it makes sense to view the results from the top
		if (this.$refs.scroller !== undefined) {
			(this.$refs.scroller as RecycleScroller).scrollToItem(0);
		}
	}

	@Prop({
		type: InfiniteTree,
		default() {
			console.log('Loaded it');
			return new InfiniteTree({
				...(this as any).$props
			});
		}
	})
	tree: InfiniteTree;

	public scrollTo(node: Node) {
		const nodeIndex = this.filteredNodes.findIndex((i) => {
			return i.id === node.id;
		});
		this.openParentNodes(node);

		// Get scroll start and end position of the current view
		const scrollLimits = this.scroller.getScroll();

		// Get scroll position of the node
		let nodeScrollPos;
		// @ts-ignore
		if (this.scroller.itemSize === null) {
			// @ts-ignore
			nodeScrollPos = nodeIndex > 0 ? this.scroller.sizes[nodeIndex - 1].accumulator : 0;
		} else {
			// @ts-ignore
			nodeScrollPos = nodeIndex * this.scroller.itemSize;
		}

		// Only scroll to node position if the node is not visible
		if (nodeScrollPos < scrollLimits.start || nodeScrollPos > scrollLimits.end) {
			// Scroll to position with some offset, so the selected item is not at the top of the hierarchy
			this.scroller.scrollToPosition(Math.max(nodeScrollPos - 0.25 * (scrollLimits.end - scrollLimits.start), 0));
		}
	}

	private openParentNodes(node: Node) {
		const parent = node.getParent();
		if (parent && parent.id != null && parent.id.length !== 0) {
			this.openParentNodes(parent);
			this.tree.openNode(parent);
		}
	}

	public isNodeFiltered(node: Node) {
		const tree = this.tree;

		if (tree === undefined) {
			return false;
		}

		return node.state.filtered === false;
	}

	private get filteredNodes() {
		console.log('Filtering nodes');
		const tree = this.tree;
		if (tree === undefined) {
			return [];
		}
		return tree.nodes.filter((node) => !(node.state.filtered === false));
	}

	nodes: Node[] = [];
	private eventHandlers = {
		// onContentWillUpdate: null,
		// onContentDidUpdate: null,
		// onOpenNode: null,
		// onCloseNode: null,
		onSelectNode: null
		// onWillOpenNode: null,
		// onWillCloseNode: null,
		// onWillSelectNode: null,
		// onKeyUp: null,
		// onKeyDown: null,
		// onMouseEnter: null,
		// onMouseLeave: null
	} as any;

	mounted() {
		// Updates the tree.
		this.tree.update = () => {
			this.tree.emit('contentWillUpdate');
			this.$nextTick(() => {
				this.tree.emit('contentDidUpdate');
			});
		};
		Object.keys(this.eventHandlers).forEach((key) => {
			if (!(this as any)[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2)); // e.g. onContentWillUpdate -> contentWillUpdate
			this.eventHandlers[key] = (this as any)[key];
			this.tree.on(eventName, this.eventHandlers[key]);
		});
	}

	beforeDestroy() {
		Object.keys(this.eventHandlers).forEach((key) => {
			if (!this.eventHandlers[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2)); // e.g. onUpdate -> update
			this.tree.removeListener(eventName, this.eventHandlers[key]);
			this.eventHandlers[key] = null;
		});
	}
}
</script>
<style scoped>
.scroll-box {
	width: 100%;
	height: 100%;
	overflow: auto;
}
</style>
