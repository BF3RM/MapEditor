<template>
	<gl-component>
		{{ list }}
		<div class="header">
			<input type="input" :value="data.search" @input="onSearch" placeholder="search">
		</div>
		<DynamicScroller
				ref="scroller"
				:items="filteredItems()"
				class="scrollable"
				:min-item-size="30"
		>
			<DynamicScrollerItem
					class="listEntry"
					slot-scope="{ item, index, active }"
					:item="item"
					:active="active"
					:data-index="index"
					@click.native="onClick(item)"
					:size-dependencies="[item.expanded]"
					:min-item-size="30"
			>
				<div>
					{{ item.name }}
				</div>
			</DynamicScrollerItem>
		</DynamicScroller>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop, Ref, Watch } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { TreeNode } from '../types/TreeNode';

@Component({ components: { DynamicScroller, DynamicScrollerItem } })
export default class ListComponent extends EditorComponent {
	@Prop() public title!: string;
	public list: any = [];

	private data: {
		search: string
	} = {
		search: ''
	};

	constructor() {
		super();
	}

	public mounted() {
	}

	private onClick(item: TreeNode) {
		Object.assign(item, this.list[item.id]);
	}

	private onUpdateFilter(a: any) {
		this.list = a.target.value;
	}

	private onSearch(a: any) {
		this.data.search = a.target.value;
	}

	private filteredItems() {
		const lowerCaseSearch = this.data.search.toLowerCase();
		return this.list; // .filter((i) => i.name.toLowerCase().includes(lowerCaseSearch));
	}
}
</script>
<style scoped>
	.header {
		display:flex;
	}
	.scrollable {
		height: 100%;
	}
</style>
