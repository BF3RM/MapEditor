<template>
  <RecycleScroller :class="className"
                   :items="tree.nodes"
                   :item-height="rowHeight"
                   ref="virtualList"
                   :min-item-size="20"
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

<script>
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import InfiniteTree from 'infinite-tree';

const lcfirst = (str) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};
export default {
	name: 'InfiniteTree',
	components: {
		RecycleScroller
	},
	props: {
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
			default: () => {}
		},
		shouldSelectNode: {
			type: Function,
			default: () => {}
		},
		shouldLoadNodes: {
			type: Function,
			default: () => {}
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
			el: this.$refs.tree,
			...this.$props
		});

		// Updates the tree.
		this.tree.update = () => {
			this.tree.emit('contentWillUpdate');
			this.nodes = this.tree.nodes;
			this.$nextTick(function () {
				this.tree.emit('contentDidUpdate');
			});
		};

		Object.keys(this.eventHandlers).forEach(key => {
			if (!this[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2)); // e.g. onContentWillUpdate -> contentWillUpdate
			this.eventHandlers[key] = this[key];
			this.tree.on(eventName, this.eventHandlers[key]);
		});
	},
	beforeDestroy() {
		Object.keys(this.eventHandlers).forEach(key => {
			if (!this.eventHandlers[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2)); // e.g. onUpdate -> update
			this.tree.removeListener(eventName, this.eventHandlers[key]);
			this.eventHandlers[key] = null;
		});

		this.tree.destroy();
		this.tree = null;
	},
	inheritAttrs: false,
	data() {
		return {
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
	computed: {},
	methods: {},
	watch: {
		data: {
			handler(newValue) {
				this.tree.loadData(newValue);
			},
			deep: true
		}
	}
};
</script>
<style scoped>
  .scroll-box {
    width: 400px;
    height: 600px;
    overflow: auto;
  }
</style>
