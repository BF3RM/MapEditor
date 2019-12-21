<template>
  <RecycleScroller :class="className"
                   class="scrollable"
                   :items="filteredNodes"
                   :item-height="rowHeight"
                   ref="scroller"
                   :min-item-size="16"
  >
    <div slot-scope="{ item,index }">
      <slot
        v-bind="{
          node: item,
          tree: tree,
          index: index
        }"
      />
    </div>
  </RecycleScroller>
</template>

<script lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import InfiniteTree, { INode, Node } from 'infinite-tree';
import { Vue, Component, Prop, Watch } from 'vue-property-decorator';

const lcfirst = (str: string) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};
@Component({ components: { RecycleScroller } })
export default class InfiniteTreeComponent extends Vue {
	@Prop(String) search: string;
	@Prop({ type: String, default: 'scroll-box' }) className: string;
	@Prop({ type: Boolean, default: true }) autoOpen: boolean;
	@Prop({ type: Boolean, default: true }) selectable: boolean;
	@Prop({ type: Number, default: 0 }) tabIndex: number;
	@Prop({ type: Object, default: [] }) data: object[];
	@Prop({ type: Number, default: 32 }) rowHeight: number;
	@Prop({ type: Function, default(node: Node) { return true; } }) loadNodes: boolean;
	@Prop({ type: Function, default(id: string) { return true; } }) getNodeById: Node;
	@Prop({ type: Function, default(node: Node) { return (this as any).scrollTo(node); } }) public scrollToNode: Function;
	@Prop({ type: Function, default(node: Node) { console.log('ShouldLoadNodes'); return !(node.children.length > 0) && node.loadOnDemand; } }) shouldLoadNodes: boolean;
	@Prop({
		type: Function,
		default(node: Node) {
			if (!node || (node === (this as any).tree.getSelectedNode())) {
				return false; // Prevent from deselecting the current node
			}
			return true;
		}
	}) shouldSelectNode: boolean;

	@Prop({ type: Function }) onContentWillUpdate: void;
	@Prop({ type: Function }) onContentDidUpdate: void;
	@Prop({ type: Function }) onOpenNode: void;
	@Prop({ type: Function }) onCloseNode: void;
	@Prop({ type: Function }) onSelectNode: void;
	@Prop({ type: Function }) onWillOpenNode: void;
	@Prop({ type: Function }) onWillCloseNode: void;
	@Prop({ type: Function }) onWillSelectNode: void;
	@Prop({ type: Function }) onKeyUp: void;
	@Prop({ type: Function }) onKeyDown: void;
	@Prop({ type: Function }) onMouseLeave: void;
	@Prop({ type: Function }) onMouseEnter: void;
	@Watch('data')
	onDataChange(newValue: any) {
		console.log('datachange');
		this.tree.loadData(newValue);
	}

	@Watch('search')
	onSearchChange(newValue: string) {
		console.log('Search: ' + newValue);
		if (newValue === '') {
			(this.tree).unfilter();
		}
		(this.tree).filter(newValue);
	}

	@Prop({
		type: InfiniteTree,
		default() {
			console.log('Loaded it');
			return new InfiniteTree({
				...(this as any).$props
			});
		}
	}) tree: InfiniteTree;

	private get filteredNodes() {
		const search = this.search;
		console.log('Filtering nodes');
		const tree = this.tree;
		if (tree === undefined) {
			return [];
		}
		const out = tree.nodes.filter((node) => !(node.state.filtered === false));
		return out;
	}

	private nodes: Node[] = [];
	private eventHandlers = {
		onContentWillUpdate: null,
		onContentDidUpdate: null,
		onOpenNode: null,
		onCloseNode: null,
		onSelectNode: null,
		onWillOpenNode: null,
		onWillCloseNode: null,
		onWillSelectNode: null,
		onKeyUp: null,
		onKeyDown: null,
		onMouseEnter: null,
		onMouseLeave: null
	} as any;

	mounted() {
		// Updates the tree.
		this.tree.update = () => {
			this.tree.emit('contentWillUpdate');
			this.$nextTick(function() {
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

	scrollTo(node: Node) {
		const nodeIndex = (this.filteredNodes).findIndex((i) => {
			console.log(i.id === node.id);
			return i.id === node.id;
		});
		(this.$refs.scroller as RecycleScroller).scrollToItem(nodeIndex);
	}
}
/*
export default {
	name: 'InfiniteTreeComponent',
	components: {
		RecycleScroller
	},
	props: {
	},

	,
	inheritAttrs: false,
	,
	computed: {

	},
	methods: {

	},
	watch: {

		search: {

		}
	}
};
*/
</script>
<style scoped>
  .scroll-box {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
