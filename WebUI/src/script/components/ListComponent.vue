<template>
	<gl-component>
		<div class="header">
			<input type="input" :value="data.search" @input="onSearch" placeholder="search">
		</div>
		<div class="header" v-if="headers">
			<div class="th" v-for="header in headers" :key="header">{{header}}</div>
		</div>
		<DynamicScroller
				ref="scroller"
				:items="filteredItems()"
				class="scrollable"
				:min-item-size="30"
				:key-field="keyField"
		>
				<DynamicScrollerItem
						class="tr"
						slot-scope="{ item, index, active }"
						:item="item"
						:active="active"
						:size-dependencies="[item.expanded]"
						:min-item-size="30"
						@click.native="onClick(item)"
				>
				<slot :item="item" :data="data">
				</slot>
				</DynamicScrollerItem>
		</DynamicScroller>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop, Ref, Watch } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

@Component({ components: { RecycleScroller, DynamicScroller, DynamicScrollerItem } })
export default class ListComponent extends EditorComponent {
	@Prop() public title: string;
	@Prop(Array) public list: Array<{name: string}>;
	@Prop(String) public keyField: string;
	@Prop(Array) public headers: string[];
	@Prop(Function) public click: void;
	public data: {
		search: string,
	} = {
		search: ''
	};

	constructor() {
		super();
	}

	private onClick(item: any) {
		if (this.click !== undefined) {
			// @ts-ignore
			this.click(item);
		}
	}

	private onSearch(a: any) {
		this.data.search = a.target.value;
	}

	private filteredItems() {
		const lowerCaseSearch = this.data.search.toLowerCase();
		return this.list.filter((i) => i.name.toLowerCase().includes(lowerCaseSearch));
	}
}
</script>
<style scoped>
	.header {
		display:flex;
	}
	.scrollable {
		height: 100%;
		width: 100%;
	}
</style>
