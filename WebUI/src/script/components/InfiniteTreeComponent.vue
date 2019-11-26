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
import { InfiniteTree } from 'infinite-tree';
import { Node } from 'flattree';

const lcfirst = (str: string) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};

@Component({ components: { RecycleScroller } })
export default class InfiniteTreeComponent extends Vue {
	get filteredNodes() {
		const scope = (this as InfiniteTreeComponent);
		if (scope.tree === undefined || scope.tree.nodes === undefined) {
			return [];
		}
		return scope.tree.nodes.filter((node) => !node.state.filtered === false);
	}

	@Prop() search: string;
	@Prop({ default: 'scroll-box' }) className: string;
	@Prop() autoOpen: boolean;
	@Prop() selectable: boolean;
	@Prop({ default: 1 }) tabIndex: number;
	@Prop([Array, Object]) data: any;
	@Prop({ default: 32 }) rowHeight: number;
	@Prop(Function) loadNodes: boolean;

	@Prop({
		type: Function,
		default: (node:Node) => () => {
			if (!node || (node === (this as InfiniteTreeComponent).tree.getSelectedNode())) {
				return false; // Prevent from deselecting the current node
			}
			return true;
		}
	})
	shouldSelectNode: void;

	// Callback invoked before updating the tree.
	@Prop(Function) onContentWillUpdate: void;

	// Callback invoked when the tree is updated.
	@Prop(Function) onContentDidUpdate: void;
	// Callback invoked when a node is opened.
	@Prop(Function) onOpenNode: void;
	// Callback invoked when a node is closed.
	@Prop(Function) onCloseNode: void;
	// Callback invoked when a node is selected or deselected.
	@Prop(Function) onSelectNode: void;
	// Callback invoked before opening a node.
	@Prop(Function) onWillOpenNode: void;
	// Callback invoked before closing a node.
	@Prop(Function) onWillCloseNode: void;
	// Callback invoked before selecting or deselecting a node.
	@Prop(Function) onWillSelectNode: void;
	@Prop(Function) onKeyUp: void;
	@Prop(Function) onKeyDown: void;
	@Prop(Function) onMouseLeave: void;
	@Prop(Function) onMouseEnter: void;

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
		deep: false
	})
	onSearch(searchString: string) {
		console.log(searchString);
		this.tree.filter(searchString);
	}

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
