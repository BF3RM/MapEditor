<template>
	<!-- Gameface port: vue-virtual-scroller's RecycleScroller RECYCLES DOM nodes (reuses
	     the same <div> pool for different items and re-renders on internal rAF/resize
	     timers). In Gameface that means the node you're clicking can be recycled between
	     mousedown and mouseup, so the click is LOST -> selecting a folder intermittently
	     does nothing. Replaced with a lightweight own virtualization: a windowed plain
	     list with a STABLE :key per node.id. When idle (not scrolling) the visible set is
	     stable -> zero DOM churn -> every click lands; still only renders the viewport
	     window (+buffer) so the Hierarchy (thousands of nodes) stays fast. -->
	<div :class="className" class="scrollable it-scroller" ref="scroller" @scroll="onScroll">
		<div class="it-sizer" :style="{ height: totalHeight + 'px' }">
			<div class="it-window" :style="{ transform: 'translateY(' + offsetY + 'px)' }">
				<div class="it-row" v-for="vi in visibleNodes" :key="vi.node.id" :style="{ height: rowHeight + 'px' }">
					<slot
						v-bind="{
							node: vi.node,
							tree: tree,
							index: vi.index,
							data: data
						}"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import InfiniteTree, { Node } from 'infinite-tree';
import { Component, Prop, Ref, Vue, Watch } from 'vue-property-decorator';

const lcfirst = (str: string) => {
	str += '';
	return str.charAt(0).toLowerCase() + str.substr(1);
};

// PERF: mark the whole InfiniteTree node graph `_isVue` so Vue's observe() skips it.
// Without this, passing a node to a slot as :node would deep-observe that node AND its
// entire children subtree (a top-level folder = thousands of nodes) -> the ~2s freeze.
// One O(n) pass right after loadData covers every node (infinite-tree builds all Node
// objects upfront, even for unopened branches).
function markNodesRaw(tree: any) {
	if (!tree) {
		return;
	}
	tree._isVue = true;
	const stack: any[] = [];
	if (typeof tree.getRootNode === 'function') {
		const root = tree.getRootNode();
		if (root) {
			stack.push(root);
		}
	}
	if (Array.isArray(tree.nodes)) {
		for (let i = 0; i < tree.nodes.length; i++) {
			stack.push(tree.nodes[i]);
		}
	}
	while (stack.length) {
		const n = stack.pop();
		if (!n || n.__raw) {
			continue;
		}
		n._isVue = true;
		n.__raw = true;
		const ch = n.children;
		if (Array.isArray(ch)) {
			for (let i = 0; i < ch.length; i++) {
				stack.push(ch[i]);
			}
		}
	}
}
@Component
export default class InfiniteTreeComponent extends Vue {
	@Ref('scroller')
	scroller: HTMLElement;

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

	// Virtualization state (reactive so the visible window recomputes).
	private scrollTop = 0;
	private viewportH = 400;
	private readonly BUFFER = 6; // rows rendered above/below the viewport

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

	@Prop({ type: Function }) onSelectNode: void;

	@Watch('data')
	onDataChange(newValue: any) {
		this.tree.loadData(newValue);
		// Tag every freshly-built node non-reactive BEFORE it can be rendered/observed.
		markNodesRaw(this.tree);
		this.treeVersion++; // force re-render (tree is non-reactive)
	}

	@Watch('search')
	onSearchChange(newValue: string) {
		if (newValue === '') {
			this.tree.unfilter();
		}
		this.tree.filter(newValue);
		this.treeVersion++; // force re-render (tree is non-reactive)

		// When the search changes, it makes sense to view the results from the top.
		this.scrollTop = 0;
		if (this.scroller) {
			this.scroller.scrollTop = 0;
		}
	}

	@Prop({
		type: InfiniteTree,
		default() {
			const t = new InfiniteTree({
				...(this as any).$props
			});
			// Gameface port / PERF: Vue 2 deep-observes prop objects. The InfiniteTree
			// holds thousands of Node objects; deep-observing them made every internal
			// tree op (selectNode / openNode) trigger huge reactivity cascades — clicking
			// a folder froze the thread ~2s. Mark the instance + its nodes `_isVue` so
			// Vue's observe() SKIPS them entirely. We drive re-renders ourselves via
			// `treeVersion` bumped on the tree's contentWillUpdate event.
			markNodesRaw(t);
			return t;
		}
	})
	tree: InfiniteTree;

	// Bumped on every tree mutation (contentWillUpdate) to invalidate filteredNodes,
	// since the tree itself is no longer reactive.
	private treeVersion = 0;

	private onTreeContentWillUpdate = () => {
		// Force filteredNodes (and the window) to recompute after a tree mutation.
		this.treeVersion++;
	};

	mounted() {
		// Patch the tree's update() to emit the content lifecycle events (as the
		// original did) and drive our own measurement.
		this.tree.update = () => {
			this.tree.emit('contentWillUpdate');
			this.$nextTick(() => {
				this.tree.emit('contentDidUpdate');
			});
		};
		// Re-render on every tree mutation (the tree is non-reactive now).
		this.tree.on('contentWillUpdate', this.onTreeContentWillUpdate);
		// Belt-and-suspenders: ensure any nodes built at construction are tagged raw
		// before the first interaction.
		markNodesRaw(this.tree);
		Object.keys(this.eventHandlers).forEach((key) => {
			if (!(this as any)[key]) {
				return;
			}
			const eventName = lcfirst(key.substr(2)); // e.g. onSelectNode -> selectNode
			this.eventHandlers[key] = (this as any)[key];
			this.tree.on(eventName, this.eventHandlers[key]);
		});
		this.$nextTick(() => this.measure());
		window.addEventListener('resize', this.measure);

		// Gameface port: DELEGATED row activation. Per-row @mousedown listeners silently
		// fail on the Scene Instances tree (rows are rebuilt as objects stream in). One
		// listener on the stable scroll container catches every click and maps it back to
		// a node via data-node-id. Fires for both mousedown and click (parent dedupes).
		const sc = this.$refs.scroller as HTMLElement;
		if (sc) {
			sc.addEventListener('mousedown', this.onDelegatedActivate);
			sc.addEventListener('click', this.onDelegatedActivate);
		}
	}

	private onDelegatedActivate = (e: MouseEvent) => {
		let t = e.target as HTMLElement | null;
		const root = this.$refs.scroller as HTMLElement;
		let row: HTMLElement | null = null;
		let control: string | null = null;
		while (t && t !== root) {
			const cls = t.className && typeof t.className === 'string' ? t.className : '';
			// Note which per-row control (if any) the click landed on. The control divs are
			// descendants of the [data-node-id] row, so we keep walking to resolve the node.
			if (!control) {
				if (cls.indexOf('enable-container') !== -1) {
					control = 'enable';
				} else if (cls.indexOf('selectable-container') !== -1) {
					control = 'select';
				} else if (cls.indexOf('expand-container') !== -1) {
					control = 'expand';
				}
			}
			if (t.getAttribute && t.getAttribute('data-node-id') !== null) {
				row = t;
				break;
			}
			t = t.parentElement;
		}
		if (!row) {
			return;
		}
		const id = row.getAttribute('data-node-id');
		if (!id || !this.tree) {
			return;
		}
		const node = this.tree.getNodeById(id);
		if (!node) {
			return;
		}
		// Gameface port: the eye (visibility) button's per-row @click is unreliable in Cohtml
		// — its <img> is the click target and the parent div's @click doesn't fire — so drive
		// it from here. Fire ONCE, on mousedown only: a toggle fired on both mousedown AND
		// click would cancel itself out. The multi-select checkbox and the expand chevron keep
		// their own working per-row handlers, so we just skip them (no row-select).
		if (control === 'enable') {
			if (e.type === 'mousedown') {
				this.$emit('node-toggle-enable', { node, event: e });
			}
			return;
		}
		if (control) {
			return;
		}
		this.$emit('node-activate', { node, event: e });
	};

	updated() {
		// Catch panel (dock) resizes that don't fire a window resize event. Guarded by
		// equality so it converges instead of looping.
		this.measure();
	}

	measure() {
		const el = this.$refs.scroller as HTMLElement;
		if (!el) return;
		if (el.clientHeight && el.clientHeight !== this.viewportH) this.viewportH = el.clientHeight;
	}

	onScroll() {
		const el = this.$refs.scroller as HTMLElement;
		if (el) this.scrollTop = el.scrollTop;
	}

	private get filteredNodes(): Node[] {
		// Touch treeVersion so this computed re-evaluates on tree mutations (the tree is
		// intentionally non-reactive now — see the `_isVue` note above).
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const _dep = this.treeVersion;
		const tree = this.tree;
		if (tree === undefined) {
			return [];
		}
		return tree.nodes.filter((node) => !(node.state.filtered === false));
	}

	private get rh(): number {
		return this.rowHeight || 25;
	}

	get startIndex(): number {
		return Math.max(0, Math.floor(this.scrollTop / this.rh) - this.BUFFER);
	}

	get endIndex(): number {
		return Math.min(
			this.filteredNodes.length,
			Math.ceil((this.scrollTop + this.viewportH) / this.rh) + this.BUFFER
		);
	}

	get visibleNodes(): { node: Node; index: number }[] {
		const items = this.filteredNodes;
		const out: { node: Node; index: number }[] = [];
		for (let i = this.startIndex; i < this.endIndex && i < items.length; i++) {
			const node = items[i] as any;
			// PERF (Gameface): markNodesRaw only tags nodes present at loadData. Nodes that
			// STREAM in afterwards (added via addChildNodes as the level loads its objects) stay
			// untagged, so the first time one is bound to a slot as :node, Vue deep-observes it
			// AND its whole prefab subtree — the ~2s-per-node freeze that, across B2K/XP1's ~17k
			// objects, became a multi-second (perceived "forever") hang. Tag each node right
			// before it renders so observe() skips it and its subtree. O(window) => never O(n²).
			if (node && node.__raw !== true) {
				node._isVue = true;
				node.__raw = true;
			}
			out.push({ node: items[i], index: i });
		}
		return out;
	}

	get totalHeight(): number {
		return this.filteredNodes.length * this.rh;
	}

	get offsetY(): number {
		return this.startIndex * this.rh;
	}

	public scrollTo(node: Node) {
		this.openParentNodes(node);
		const el = this.$refs.scroller as HTMLElement;
		if (!el) {
			return;
		}
		const nodeIndex = this.filteredNodes.findIndex((i) => i.id === node.id);
		if (nodeIndex < 0) {
			return;
		}
		const nodeTop = nodeIndex * this.rh;
		const viewTop = el.scrollTop;
		const viewBottom = viewTop + el.clientHeight;
		// Only scroll if the node isn't already visible.
		if (nodeTop < viewTop || nodeTop + this.rh > viewBottom) {
			el.scrollTop = Math.max(nodeTop - 0.25 * el.clientHeight, 0);
			this.scrollTop = el.scrollTop;
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

	nodes: Node[] = [];
	private eventHandlers = {
		onSelectNode: null
	} as any;

	beforeDestroy() {
		window.removeEventListener('resize', this.measure);
		const sc = this.$refs.scroller as HTMLElement;
		if (sc) {
			sc.removeEventListener('mousedown', this.onDelegatedActivate);
			sc.removeEventListener('click', this.onDelegatedActivate);
		}
		this.tree.removeListener('contentWillUpdate', this.onTreeContentWillUpdate);
		Object.keys(this.eventHandlers).forEach((key) => {
			if (!this.eventHandlers[key]) {
				return;
			}

			const eventName = lcfirst(key.substr(2));
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
.it-scroller {
	position: relative;
}
.it-sizer {
	position: relative;
	width: 100%;
}
.it-window {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
}
/* position:relative so the node's `.selected::after` blue bar (position:absolute)
   anchors to its own row, not to the whole window. */
.it-row {
	position: relative;
}
</style>
