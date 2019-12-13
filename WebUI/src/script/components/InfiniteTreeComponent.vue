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

const lcfirst = (str) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};

export default {
	name: 'InfiniteTreeComponent',
	components: {
		RecycleScroller
	},
	props: {
		search: {
			type: String,
			default: ''
		},
		className: {
			type: String,
			default: 'scroll-box'
		},
		autoOpen: {
			type: Boolean,
			default: false
		},
		selectable: {
			type: Boolean,
			default: true
		},
		tabIndex: {
			type: Number,
			default: 1
		},
		data: {
			type: [Array, Object],
			default: () => {
				return [];
			}
		},
		rowHeight: {
			type: Number,
			default: 32
		},
		loadNodes: {
			type: Function,
			default: () => {
				console.log('loading');
				// Comment to stop the linter from complaining
			}
		},
		getNodeById: {
			type: Function,
			default: (id: string) => () => {
				return this.tree.getNodeById(id);
			}
		},
		scrollToNode: {
			type: Function,
			default: function(node: Node) {
				return this.scrollTo(node);
			}
		},
		shouldSelectNode: {
			type: Function,
			default: (node) => {
				if (!node || (node === this.tree.getSelectedNode())) {
					return false; // Prevent from deselecting the current node
				}
				return true;
			}
		},
		shouldLoadNodes: {
			type: Function,
			default: (node) => {
				return !node.children.length > 0 && node.loadOnDemand;
			}
		},
		// Callback invoked before updating the tree.
		onContentWillUpdate: {
			type: Function,
			default: null
		},

		// Callback invoked when the tree is updated.
		onContentDidUpdate: {
			type: Function,
			default: null
		},

		// Callback invoked when a node is opened.
		onOpenNode: {
			type: Function,
			default: null
		},

		// Callback invoked when a node is closed.
		onCloseNode: {
			type: Function,
			default: null
		},

		// Callback invoked when a node is selected or deselected.
		onSelectNode: {
			type: Function,
			default: null
		},

		// Callback invoked before opening a node.
		onWillOpenNode: {
			type: Function,
			default: null
		},

		// Callback invoked before closing a node.
		onWillCloseNode: {
			type: Function,
			default: null
		},

		// Callback invoked before selecting or deselecting a node.
		onWillSelectNode: {
			type: Function,
			default: null
		},
		onKeyUp: {
			type: Function,
			default: null
		},
		onKeyDown: {
			type: Function,
			default: null
		},
		onMouseLeave: {
			type: Function,
			default: null
		},
		onMouseEnter: {
			type: Function,
			default: null
		}
	},
	mounted() {
		this.tree = new InfiniteTree({
			...this.$props
		});

		// Updates the tree.
		this.tree.update = () => {
			this.tree.emit('contentWillUpdate');
			this.nodes = this.tree.nodes;
			this.$nextTick(function() {
				this.tree.emit('contentDidUpdate');
			});
		};
		Object.keys(this.eventHandlers).forEach((key) => {
			if (!this[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2)); // e.g. onContentWillUpdate -> contentWillUpdate
			this.eventHandlers[key] = this[key];
			this.tree.on(eventName, this.eventHandlers[key]);
		});
	},
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
	},
	inheritAttrs: false,
	data() {
		return {
			loaded: false,
			nodes: [],
			tree: {
				nodes: []
			},
			eventHandlers: {
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
			}
		};
	},
	computed: {
		filteredNodes() {
			const { search, tree } = this;
			const out = tree.nodes.filter((node) => !(node.state.filtered === false));
			return out;
		}
	},
	methods: {
		scrollTo: function(node: Node) {
			const nodeIndex = this.filteredNodes.findIndex((i) => {
				console.log(i.id === node.id);
				return i.id === node.id;
			});
			console.log((this.$refs as any).scroller);

			(this.$refs.scroller as RecycleScroller).scrollToItem(nodeIndex);
		}
	},
	watch: {
		data: {
			handler(newValue) {
				this.tree.loadData(newValue);
			},
			deep: false
		},
		search: {
			handler(newValue) {
				console.log('Search: ' + newValue);
				if (newValue === '') {
					this.tree.unfilter();
				}
				this.tree.filter(newValue);
				console.log(this.tree.nodes);
			}
		}
	}
};
</script>
<style scoped>
  .scroll-box {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
