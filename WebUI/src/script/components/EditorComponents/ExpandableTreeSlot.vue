<template>
	<div class="tree-node" :class="{ selected: selected, disabled: !enabled }" @mouseleave="NodeHoverEnd()" @mouseenter="NodeHover($event,node,tree)" @click="SelectNode($event, node, tree)">
		<div v-if="hasVisibilityOptions" class="visibility-node">
			<div class="enable-container icon-container" @click="ToggleEnabled($event, node, tree)">
				<img :src="enabledIcnSrc" title="Enable / Disable" />
			</div>
			<div class="selectable-container icon-container" @click="ToggleRaycastEnabled($event, node, tree)">
				<img :src="raycastEnabledIcnSrc" title="Selectable" />
			</div>
		</div>
		<div class="tree-node" :style="nodeStyle(node)">
			<div class="expand-container icon-container" @click="ToggleNode($event,node,tree)">
				<img v-if="node.children.length > 0" :class="{ expanded: node.state.open}"
					:src="require(`@/icons/editor/new/chevron-right.svg`)"/>
			</div>
			<div class="icon-container">
				<img :class="getNodeIconClass(node)"/>
			</div>
			<div class="text-container">
				<Highlighter v-if="search !== ''" :text="node.name" :search="search"/>
				<span class="slot-text" v-else>
					{{ nodeText }}
				</span>
				<div class="slot-client-server-only" v-if="clientOnly">
					client-only
				</div>
				<div class="slot-client-server-only" v-if="serverOnly">
					server-only
				</div>
			</div>
		</div>
	</div>
</template>
<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import Highlighter from '@/script/components/widgets/Highlighter.vue';
import InfiniteTree, { Node, INode } from 'infinite-tree';
import { REALM } from '@/script/types/Enums';

@Component({ components: { Highlighter } })
export default class ExpandableTreeSlot extends Vue {
	@Prop({ default: false })
	hasVisibilityOptions?: boolean;

	@Prop()
	node: Node;

	@Prop()
	tree: any;

	@Prop()
	search: any;

	@Prop()
	nodeText: string;

	@Prop()
	selected: boolean;

	@Prop()
	content: any[] | null;

	get enabled() {
		if (this.content && this.content[0]) {
			return this.content[0].enabled;
		} else {
			return true;
		}
	}

	get clientOnly() {
		if (this.content && this.content[0]) {
			return this.content[0].realm === REALM.CLIENT;
		} else {
			return false;
		}
	}

	get serverOnly() {
		if (this.content && this.content[0]) {
			return this.content[0].realm === REALM.SERVER;
		} else {
			return false;
		}
	}

	getNodeIconClass(node: Node) {
		if (node.type === 'folder') {
			if (node.state.open) {
				return 'Icon Icon-' + node.type + '-open';
			}
		}
		return 'Icon Icon-' + node.type;
	}

	get raycastEnabled() {
		if (this.content && this.content[0]) {
			return this.content[0].raycastEnabled;
		} else {
			return true;
		}
	}

	get enabledIcnSrc() {
		return this.enabled ? require('@/icons/editor/new/eye.svg') : require('@/icons/editor/new/eye-crossed.svg');
	}

	get raycastEnabledIcnSrc() {
		return this.raycastEnabled ? require('@/icons/editor/new/select.svg') : require('@/icons/editor/new/select-crossed.svg');
	}

	private nodeStyle(node: Node) {
		if (!node.state) {
			console.error('Missing node state: ' + node);
		}
		return {
			'margin-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	@Emit('node:click')
	public SelectNode(e: MouseEvent, node: Node, tree: InfiniteTree) {
		this.tree.selectNode(node);
		this.$forceUpdate();
		return { event: e, nodeId: node.id };
	}

	@Emit('node:toggle-enable')
	public ToggleEnabled(e: MouseEvent, node: Node, tree: InfiniteTree) {
		e.stopPropagation();
		return node;
	}

	@Emit('node:toggle-raycast-enable')
	public ToggleRaycastEnabled(e: MouseEvent, node: Node, tree: InfiniteTree) {
		e.stopPropagation();
		return node;
	}

	public ToggleNode(e: MouseEvent, node: Node, tree: InfiniteTree) {
		const toggleState = this.toggleState(node);
		if (toggleState === 'closed') {
			tree.openNode(node);
		} else if (toggleState === 'opened') {
			tree.closeNode(node);
		}
		e.stopPropagation();
	}

	@Emit('node:hover')
	private NodeHover(e: MouseEvent, node: Node, tree: InfiniteTree) {
		return node.id;
	}

	@Emit('node:hover-end')
	private NodeHoverEnd() {
		//
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
	.visibility-node {
		display: flex;
		align-content: center;
		height: 100%;
		width: 45px;
		min-width: 45px;
		align-items: center;

		.icon-container {
			flex: 1 1 auto;
			text-align: center;

			img {
				width: 16px;
			}
		}
	}

	.tree-node {
		display: flex;
		font-family: sans-serif;
		flex-direction: row;
		/*font-size: 1.3vmin;*/
		user-select: none;
		align-content: center;
		align-items: center;
		height: 25px;
		/*white-space: nowrap;*/

		.text-container {
			display: flex;
			flex-direction: row;
			width: max-content;
			//overflow: hidden;
			font-weight: 400;
			font-size: 13px;
		}

		.expand-container {
			width: 22px;
			text-align: center;

			img {
				width: 17px;
				transition: transform 0.1s;

				&.expanded {
					transform: rotate(90deg);
				}
			}
		}

		.icon-container {
			.Icon {
				width: 17px;
				height: 17px;
			}
		}

		&.disabled {
			opacity: .25;
			text-decoration: line-through;
		}

		&:hover,
		&.selected {
			background-color: #313848;
			// color: #037fff;
		}
		&.selected {
			&::after {
				content: "";
				position: absolute;
				right: 0;
				top: 0;
				bottom: 0;
				width: 2px;
				background: #037fff;
			}
		}

		.slot-text {
			margin-left: 5px;
		}

		.slot-client-server-only {
			background: #F4AB00;
			padding: 2px 4px 1px;
			border-radius: 3px;
			margin: 0 0 0 7px;
			font-size: 10px;
			color: #000;
			text-transform: uppercase;
			font-weight: 900;
		}
	}
</style>
