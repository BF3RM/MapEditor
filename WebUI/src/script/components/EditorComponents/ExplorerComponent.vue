<template>
	<!-- Gameface port: golden-layout gl-col/gl-row/gl-stack replaced with flexbox. -->
	<div class="explorer-flex">
		<div class="ex-col ex-project">
			<EditorComponent id="explorer-component" title="Project">
				<div class="header">
					<Search v-model="search" />
				</div>
				<infinite-tree-component
					class="scrollable datafont"
					ref="it"
					:search="search"
					:autoOpen="false"
					:data="treeData"
					:selectable="true"
					:should-select-node="shouldSelectNode"
					:row-height="25"
					:on-select-node="onSelectNode"
					@node-activate="onExplorerActivate"
				>
					<expandable-tree-slot
						slot-scope="{ node, tree }"
						:node="node"
						:tree="tree"
						:search="search"
						:nodeText="node.name"
						:selected="selectedId === node.id"
						:on-select="onNodeSelected"
					/>
				</infinite-tree-component>
			</EditorComponent>
		</div>
		<div class="ex-col ex-tabs">
			<div class="ex-tab-bar">
				<div class="ex-tab" :class="{ active: tab === 'data' }" @click="tab = 'data'">Project Data</div>
				<div class="ex-tab" :class="{ active: tab === 'logs' }" @click="tab = 'logs'">Logs</div>
			</div>
			<div class="ex-tab-body">
				<div class="ex-tab-pane" v-show="tab === 'data'">
					<GridComponent
						class="datafont"
						:right-align="true"
						title=""
						:list="list"
						:keyField="'instanceGuid'"
						:headers="['Name', 'Type']"
						:click="SpawnBlueprint"
					>
						<template v-slot:grid="{ item, data, iconSize }">
							<img
								class="Icon"
								:src="iconSrc(item.typeName)"
								:style="{ width: iconSize + 'px', height: iconSize + 'px' }"
							/>
							<!-- Gameface port: Highlighter is a full Vue component (composition-api +
							     v-html) PER item. Mounting hundreds at once when a big folder is
							     selected cost ~2s and blocked the thread. Only use it when actually
							     searching; plain text otherwise (the common browse case). -->
							<div v-if="!data.search" class="name">{{ item.fileName }}</div>
							<div v-else><Highlighter class="name" :text="item.fileName" :search="data.search" /></div>
						</template>
						<template v-slot:list="{ item }">
							<img class="Icon" :src="iconSrc(item.typeName)" />
							<div v-if="!search" class="td name">{{ cleanPath(item.name) }}</div>
							<div v-else><Highlighter class="td name" :text="cleanPath(item.name)" :search="search" /></div>
							<div class="td type">{{ item.typeName }}</div>
						</template>
					</GridComponent>
				</div>
				<div class="ex-tab-pane" v-show="tab === 'logs'">
					<ConsoleComponent />
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.explorer-flex {
	display: flex;
	flex-direction: row;
	height: 100%;
	width: 100%;
}
.ex-col {
	display: flex;
	min-width: 0;
	min-height: 0;
	height: 100%;
}
.ex-project {
	flex: 0 0 22%;
	border-right: 1px solid #05070b;
}
.ex-tabs {
	flex: 1 1 auto;
	flex-direction: column;
}
.ex-tab-bar {
	display: flex;
	flex: 0 0 auto;
	background: rgba(22, 25, 36, 1);
	border-bottom: 1px solid rgba(5, 7, 11, 0.6);
}
.ex-tab {
	padding: 6px 14px;
	font-size: 12px;
	font-weight: 600;
	color: #6b7a8d;
	cursor: pointer;
}
.ex-tab.active {
	color: #dfe4ea;
	background: rgba(31, 38, 51, 0.92);
}
.ex-tab-body {
	flex: 1 1 auto;
	min-height: 0;
	display: flex;
}
.ex-tab-pane {
	flex: 1 1 auto;
	min-height: 0;
	min-width: 0;
	display: flex;
}
.ex-tab-pane > * {
	width: 100%;
}
.ex-col > * {
	width: 100%;
}
</style>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import EditorComponent from '@/script/components/EditorComponents/EditorComponent.vue';
import InfiniteTreeComponent from '@/script/components/InfiniteTreeComponent.vue';
import { signals } from '@/script/modules/Signals';
import { Blueprint } from '@/script/types/Blueprint';
import { getPaths, hasLowerCase, hasUpperCase } from '@/script/modules/Utils';
import { Guid } from '@/script/types/Guid';
import Highlighter from '@/script/components/widgets/Highlighter.vue';
import ListComponent from '@/script/components/EditorComponents/ListComponent.vue';
import { Node, INode } from 'infinite-tree';
import Search from '@/script/components/widgets/Search.vue';
import ExpandableTreeSlot from '@/script/components/EditorComponents/ExpandableTreeSlot.vue';
import ConsoleComponent from '@/script/components/EditorComponents/ConsoleComponent.vue';
import GridComponent from '@/script/components/EditorComponents/GridComponent.vue';

@Component({
	components: {
		GridComponent,
		ConsoleComponent,
		ExpandableTreeSlot,
		EditorComponent,
		InfiniteTreeComponent,
		ListComponent,
		Highlighter,
		Search
	}
})
export default class ExplorerComponent extends EditorComponent {
	treeData: INode = {
		type: 'folder',
		name: 'Venice',
		id: 'Venice',
		children: []
	};

	list: Blueprint[] = [];
	selected: Node | null;

	search: string = '';
	tab: 'data' | 'logs' = 'data';
	selectedId: string = '';

	mounted() {
		signals.blueprintsRegistered.connect(this.onBlueprintRegistered.bind(this));
	}

	private onBlueprintRegistered(blueprints: Blueprint[]) {
		const scope = this;
		return new Promise((resolve) => {
			const data: INode = {
				id: 'root',
				type: 'folder',
				name: 'Venice',
				children: []
			};
			// TODO: Make sure this works after the new blueprint shit.
			for (const instance of blueprints) {
				const path = instance.name;
				const paths = getPaths(path);
				let parentPath: INode = data;
				let currentPath = '';
				paths.forEach((subPath) => {
					currentPath += subPath + '/';
					if (parentPath === undefined) {
						console.error('Missing parent path?');
					}
					if (parentPath.children === undefined) {
						console.error('Missing child field?');
						return;
					}
					const parentIndex = parentPath.children.find((x) => x.name.toLowerCase() === subPath.toLowerCase());
					if (parentIndex === undefined) {
						const a = parentPath.children.push({
							id: Guid.create().toString(),
							name: subPath,
							type: 'folder',
							children: [],
							path: currentPath
						});
						if (parentPath.children[a - 1] !== undefined) {
							parentPath = parentPath.children[a - 1];
						} else {
							console.error('Missing parent path');
						}
					} else {
						parentPath = parentIndex;
						// Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
						// Replace lowercase paths with the actual case.
						if (hasUpperCase(subPath) && hasLowerCase(parentPath.name)) {
							parentPath.name = subPath;
						}
					}
				});
				if (parentPath.content === undefined) {
					parentPath.content = [];
				}
				parentPath.content.push(instance);
			}
			resolve(data);
		}).then((data) => {
			scope.treeData = data as INode;
		});
	}

	// Gameface port: fired by the delegated listener on the tree scroll container (per-row
	// listeners are unreliable). Both mousedown and click fire this; onNodeSelected is
	// idempotent so double-firing is harmless.
	onExplorerActivate(o: { node: Node; event: MouseEvent }) {
		if (o && o.node) {
			this.onNodeSelected(o.node);
		}
	}

	// Called directly from the slot click (infinite-tree's on-select-node fires
	// unreliably in Gameface) -> guarantees Project Data loads + the folder highlights.
	onNodeSelected(node: Node) {
		if (!node) {
			return;
		}
		this.selectedId = node.id;
		this.list = this.buildList(node);
		this.selected = node;
	}

	onSelectNode(node: Node) {
		if (node === null) {
			this.list = [];
			this.selected = null;
			return;
		}
		this.list = this.buildList(node);
		if (this.selected) {
			this.selected.state.selected = false;
		}
		this.selected = node;
		// this.selected.state.selected = true;
		this.$set(node.state, 'enabled', true);
		this.$set(node.state, 'selected', true);
	}

	// Gameface port: selecting a big folder (Objects has thousands of blueprints) used
	// to FREEZE for a second. The cost wasn't rendering (the grid is virtualized now) —
	// it was Vue DEEP-OBSERVING every blueprint object when the array was assigned to
	// the reactive `list`. The blueprints are read-only in the grid, so Object.freeze()
	// the result: Vue skips observation of non-extensible objects, making assignment
	// O(1) instead of O(n * fields). Also flatten via push (not repeated concat, which
	// was ~O(n^2)).
	private buildList(node: Node): Blueprint[] {
		const out: Blueprint[] = [];
		this.collectBlueprints(node, out);
		return Object.freeze(out) as unknown as Blueprint[];
	}

	private collectBlueprints(node: Node, out: Blueprint[]): void {
		if (node.content) {
			const content = node.content as Blueprint[];
			for (let i = 0; i < content.length; i++) {
				out.push(content[i]);
			}
		}
		if (node.children) {
			for (let i = 0; i < node.children.length; i++) {
				this.collectBlueprints(node.children[i] as Node, out);
			}
		}
	}

	cleanPath(path: string) {
		if (!this.selected) {
			return path;
		}
		return path.replace(this.selected.path, '');
	}

	// Gameface port: type icons via CSS `content:url()` don't render in Gameface;
	// use a real <img src> per blueprint type (Default.svg fallback).
	iconSrc(type: string): string {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			return require('@/icons/types/new/' + type + '.svg');
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			return require('@/icons/types/new/Default.svg');
		}
	}

	shouldSelectNode() {
		console.log('ShouldSelect');
		return true;
	}

	SpawnBlueprint(blueprint: Blueprint) {
		if (!blueprint) {
			return;
		}
		window.editor.SpawnBlueprint(blueprint);
	}
}
</script>
<style lang="scss" scoped>
.expand {
	display: inline;
}

.type {
	text-align: right;
}
</style>
