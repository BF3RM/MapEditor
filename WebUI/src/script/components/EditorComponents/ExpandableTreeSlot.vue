<template>
	<!-- Gameface port: selection is handled by a DELEGATED listener on the scroll
	     container (InfiniteTreeComponent), not per-row @mousedown. Per-row listeners
	     silently fail to fire on the Scene Instances tree (rows are rebuilt as objects
	     stream in). The delegated listener finds the row via this data-node-id. -->
	<div
		class="tree-node"
		:class="{ selected: selected, disabled: !enabled }"
		:data-node-id="String(node.id)"
		@mouseleave="NodeHoverEnd()"
		@mouseenter="NodeHover($event, node, tree)"
	>
		<div v-if="hasVisibilityOptions" class="visibility-node">
			<!-- Gameface port: the eye's per-row @click doesn't fire (the <img> is the click
			     target and Cohtml won't bubble it to the div's @click). Handled instead by the
			     DELEGATED listener on the tree scroller (see InfiniteTreeComponent), which emits
			     'node-toggle-enable'. No @mousedown.stop here so the event reaches the scroller. -->
			<div class="enable-container icon-container">
				<img :src="enabledIcnSrc" v-tooltip="'Visible'" />
			</div>
			<div
				class="selectable-container icon-container"
				@mousedown.stop
				@click.stop="ToggleSelect($event, node, tree)"
			>
				<span class="fx-select-box" :class="{ checked: selected }" v-tooltip="'Select'"></span>
			</div>
		</div>
		<div class="tree-node-inner" :style="nodeStyle(node)">
			<div class="expand-container icon-container" @mousedown.stop @click="ToggleNode($event, node, tree)">
				<img
					v-if="node.children.length > 0"
					:class="{ expanded: node.state.open }"
					:src="require(`@/icons/editor/new/chevron-right.svg`)"
				/>
			</div>
			<div class="icon-container">
				<img class="Icon" :src="nodeIconSrc(node)" />
			</div>
			<div class="text-container">
				<Highlighter v-if="search !== ''" :text="node.name" :search="search" />
				<span class="slot-text" v-else>
					{{ nodeText }}
				</span>
				<div class="slot-client-server-only" v-if="clientOnly">Client-only</div>
				<div class="slot-client-server-only" v-if="serverOnly">Server-only</div>
			</div>
		</div>
	</div>
</template>
<script lang="ts">
/* eslint-env node, browser */

import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import Highlighter from '@/script/components/widgets/Highlighter.vue';
import InfiniteTree, { Node } from 'infinite-tree';
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
	onSelect?: (node: Node) => void;

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

	// Gameface port: icons via CSS content:url don't render -> <img src>. Folder icon
	// only on folders; leaf nodes get their type icon.
	nodeIconSrc(node: Node): string {
		if (node.type === 'folder') {
			const open = node.state && node.state.open;
			if (open && this.selected) return require('@/icons/editor/new/selected-open-folder.svg');
			if (open) return require('@/icons/editor/new/open-folder.svg');
			if (this.selected) return require('@/icons/editor/new/selected-folder.svg');
			return require('@/icons/editor/new/close-folder.svg');
		}
		try {
			return require('@/icons/types/new/' + node.type + '.svg');
		} catch (e) {
			return require('@/icons/types/new/Default.svg');
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
		return this.raycastEnabled
			? require('@/icons/editor/new/select.svg')
			: require('@/icons/editor/new/select-crossed.svg');
	}

	nodeStyle(node: Node) {
		if (!node.state) {
			console.error('Missing node state: ' + node);
		}
		return {
			'margin-left': (node.state.depth * 18).toString() + 'px'
		};
	}

	@Emit('node:toggle-enable')
	public ToggleEnabled(e: MouseEvent, node: Node) {
		e.stopPropagation();
		return node;
	}

	@Emit('node:toggle-raycast-enable')
	public ToggleRaycastEnabled(e: MouseEvent, node: Node) {
		e.stopPropagation();
		return node;
	}

	// The square next to the eye = multi-select checkbox: toggles this object in/out of
	// the current selection (shows an X when selected). Handled in HierarchyComponent.
	@Emit('node:toggle-select')
	public ToggleSelect(e: MouseEvent, node: Node) {
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
	NodeHover(e: MouseEvent, node: Node) {
		return node.id;
	}

	@Emit('node:hover-end')
	NodeHoverEnd() {
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

	/* Multi-select checkbox: a small square that shows an X (two crossed bars, drawn in
	   CSS since glyphs are unreliable in Gameface — same trick as the window close btn)
	   when the object is selected. */
	.fx-select-box {
		display: inline-block;
		position: relative;
		width: 13px;
		height: 13px;
		border: 1px solid #5a6678;
		border-radius: 3px;
		vertical-align: middle;
		cursor: pointer;
	}
	.fx-select-box.checked {
		border-color: #037fff;
	}
	.fx-select-box.checked::before,
	.fx-select-box.checked::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 11px;
		height: 2px;
		margin: -1px 0 0 -5.5px;
		background: #037fff;
	}
	.fx-select-box.checked::before {
		transform: rotate(45deg);
	}
	.fx-select-box.checked::after {
		transform: rotate(-45deg);
	}
}

.tree-node {
	display: flex;
	font-family: sans-serif;
	flex-direction: row;
	user-select: none;
	align-content: center;
	align-items: center;
	height: 25px;

	.tree-node-inner {
		display: flex;
		font-family: sans-serif;
		flex-direction: row;
		user-select: none;
		align-content: center;
		align-items: center;
		height: 25px;
	}

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
			pointer-events: none;

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
		opacity: 0.25;
		text-decoration: line-through;
	}

	&:hover {
		background-color: #292e3c;
	}

	&.selected {
		background-color: #313848;
	}

	&.selected {
		&::after {
			content: '';
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			width: 3px;
			background: #037fff;
		}
	}

	.slot-text {
		margin-left: 5px;
	}

	.slot-client-server-only {
		// background: #F4AB00;
		border: 1px solid gray;
		padding: 2px 4px 1px;
		border-radius: 3px;
		margin: 0 0 0 7px;
		font-size: 11px;
		// color: #000;
		// text-transform: uppercase;
		// font-weight: 900;
	}
}
</style>
