<template>
	<EditorComponent class="grid-component" :title="title">
		<div class="header">
			<Search v-model="data.search" @search="onSearch"/>
			<input type="range" min="5" max="14" step="1" v-model="data.scale"/>
		</div>
		<div class="container scrollable">
			<div class="grid-container" v-if="data.scale > 5">
				<div class="grid-item" v-for="(item, index) in filteredItems()" :key="index"
					@click="onClick(item)"
					@mousedown="onMouseDown($event, item)">
					<slot name="grid" :item="item" :data="data">
					</slot>
				</div>
			</div>
			<div class="list-container" v-else>
				<DynamicScroller
					ref="scroller"
					:items="filteredItems()"
					class=""
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
						@mousedown.native="onMouseDown($event, item)"
						:key-field="keyField"
					>
						<slot name="list" :item="item" :data="data">
						</slot>
					</DynamicScrollerItem>
				</DynamicScroller>
			</div>
		</div>
		<div v-html="style">
		</div>
	</EditorComponent>
</template>

<script lang="ts">
import { Component, Prop, Ref, Watch } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import Search from '@/script/components/widgets/Search.vue';
import { Blueprint } from '@/script/types/Blueprint';
import Highlighter from '@/script/components/widgets/Highlighter.vue';

@Component({ components: { Highlighter, RecycleScroller, DynamicScroller, DynamicScrollerItem, Search, EditorComponent } })
export default class GridComponent extends EditorComponent {
	@Prop(Array) public list: {name: string}[];
	@Prop(String) public keyField: string;
	@Prop(Array) public headers: string[];
	@Prop(Function) public click: void;
	@Prop(Boolean) public rightAlign: boolean;

	public data: {
		search: string,
		scale: Number
	} = {
		search: '',
		scale: 14
	};

	constructor() {
		super();
	}

	get style() {
		// @ts-ignore;
		return ' <style> .grid-container { 	grid-template-columns: repeat(auto-fit, minmax(' + this.data.scale + 'em, 1fr)) } .grid-item { 	width: ' + this.data.scale + 'em; } .grid-item .Icon { 	width: ' + this.data.scale + 'em; 	height: ' + this.data.scale / 3 + 'em; } </style> ';
	}

	get iconStyle() {
		return {

		};
	}

	private onMouseDown(e: any, item: Blueprint) {
		console.log(item);
		window.editor.threeManager.onDragStart(e, item);
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
		if (this.list === undefined) {
			return [];
		}
		if (this.$refs.scroller !== undefined) {
			(this.$refs.scroller as DynamicScroller).scrollToItem(0);
		}
		return this.list.filter((i) => i.name.toLowerCase().includes(lowerCaseSearch));
	}
}
</script>
<style scoped lang="scss">
.list-component {
	user-select: none;

	.header {
		font-weight: bold;
		display:flex;
		padding: 0.2vmin;
		border-bottom: solid 1px #4a4a4a;
	}
	.scrollable {
		height: 100%;
		width: 100%;
	}

	.tr {
		cursor: move;
	}
	.name {
		text-align: center;
	}
}

.rightAlign {
	text-align: right;
}
.grid-container {
	/* overflow: hidden; */
	display: grid;
}
.grid-item {
	overflow: hidden;
	height: fit-content;
	text-align: center;
}
.grid-item .Icon{
	padding-top: 1em;
}

.list-component {
	user-select: none;

	.header {
		font-weight: bold;
		display:flex;
		padding: 0.2vmin;
		border-bottom: solid 1px #4a4a4a;
	}
	.scrollable {
		height: 100%;
		width: 100%;
	}

	.tr {
		cursor: move;
	}
}

.rightAlign {
	text-align: right;
}
</style>
