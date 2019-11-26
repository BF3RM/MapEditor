<template>
  <RecycleScroller :class="className"
                   class="scrollable"
                   :items="filteredNodes"
                   :item-height="rowHeight"
                   ref="virtualList"
                   :min-item-size="16"
  >
    <div slot-scope="{ item,index }">
      <slot
        v-bind="{
          node: item,
          tree: tree,
        }"
      />
    </div>
  </RecycleScroller>
</template>

<script lang="ts">
import { Component, Prop, Ref, Watch } from 'vue-property-decorator';
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import Vue from 'vue';
import InfiniteTree from 'infinite-tree';
import Node from 'flattree';

const lcfirst = (str) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};

@Component({ components: { RecycleScroller } })
export default class InfiniteTreeComponent extends Vue {
	@Prop() search;
	@Prop({ default: 'scroll-box' }) className;
	@Prop() autoOpen:boolean;
	@Prop() selectable;
	@Prop({ default: 1 }) tabIndex;
	@Prop([Array, Object]) data;
	@Prop({ default: 32 }) rowHeight;
	@Prop(Function) loadNodes;

	@Prop({
		type: Function,
		default: (node) => (node) => {
			if (!node || (node === this.tree.getSelectedNode())) {
				return false; // Prevent from deselecting the current node
			}
			return true;
		}
	})
	shouldSelectNode: Function;

	get filteredNodes() {
		if (this.tree === undefined || this.tree.nodes === undefined) {
			return [];
		}
		return this.tree.nodes.filter((node) => !node.state.filtered === false);
	}

	// Callback invoked before updating the tree.
	@Prop(Function) onContentWillUpdate;

	// Callback invoked when the tree is updated.
	@Prop(Function) onContentDidUpdate;
	// Callback invoked when a node is opened.
	@Prop(Function) onOpenNode;
	// Callback invoked when a node is closed.
	@Prop(Function) onCloseNode;
	// Callback invoked when a node is selected or deselected.
	@Prop(Function) onSelectNode;
	// Callback invoked before opening a node.
	@Prop(Function) onWillOpenNode;
	// Callback invoked before closing a node.
	@Prop(Function) onWillCloseNode;
	// Callback invoked before selecting or deselecting a node.
	@Prop(Function) onWillSelectNode;
	@Prop(Function) onKeyUp;
	@Prop(Function) onKeyDown;
	@Prop(Function) onMouseLeave;
	@Prop(Function) onMouseEnter;

	@Prop({
		default: () => () => {
			return true;
		}
	})

	@Prop({ default: [] }) data: Node[];

	@Watch('data', {
		deep: true
	})

	onDataChage(newData: Node) {
		console.log('sup');
		if (!this.loaded) {
			this.tree.loadData(newData);
			this.loaded = true;
		}
	}

	@Watch('search', {
		deep: false,
		default: (searchString: string) => {
			this.tree.filter(searchString);
		}
	})

	tree: InfiniteTree = new InfiniteTree({
		el: this.$refs.tree,
		...this.$props
	});

	eventHandlers = {
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
	};

	inheritAttrs: boolean = false;
	loaded: boolean = false;

	mounted() {
		// Updates the tree.		  this.tree.update = () => {
		this.tree = new InfiniteTree({
			el: this.$refs.tree,
			...this.$props
		});
		this.tree.emit('contentWillUpdate');
		this.$nextTick(function() {
			this.tree.emit('contentDidUpdate');
		});
		Object.keys(this.eventHandlers).forEach((key) => {
			if (!this[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2)); // e.g. onContentWillUpdate -> contentWillUpdate
			this.eventHandlers[key] = this[key];
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
		if (this.tree) {
			this.tree.destroy();
			this.tree = null;
		}
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
