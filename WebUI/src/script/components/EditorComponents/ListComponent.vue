<template>
	<EditorComponent class="list-component" :title="title">
		<div class="header">
			<Search v-model="data.search" @search="onSearch" />
		</div>
		<div class="header" v-if="headers">
			<div class="th" :class="{ rightAlign: rightAlign }" v-for="header in headers" :key="header">
				{{ header }}
			</div>
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
				slot-scope="{ item, active }"
				:item="item"
				:active="active"
				:size-dependencies="[item.expanded]"
				:min-item-size="30"
				@click.native="onClick(item)"
				@mousedown.native="onMouseDown($event, item)"
				:key-field="keyField"
			>
				<slot :item="item" :data="data"> </slot>
			</DynamicScrollerItem>
		</DynamicScroller>
	</EditorComponent>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import Search from '@/script/components/widgets/Search.vue';
import { Blueprint } from '@/script/types/Blueprint';

@Component({ components: { DynamicScroller, DynamicScrollerItem, Search, EditorComponent } })
export default class ListComponent extends EditorComponent {
	@Prop(Array) list: { name: string }[];
	@Prop(String) keyField: string;
	@Prop(Array) headers: string[];
	@Prop(Function) click: void;
	@Prop(Boolean) rightAlign: boolean;

	data: {
		search: string;
	} = {
		search: ''
	};

	onMouseDown(e: any, item: Blueprint) {
		console.log('dragging started');
		window.editor.threeManager.onDragStart(e, item);
	}

	onClick(item: any) {
		if (this.click !== undefined) {
			// @ts-ignore
			this.click(item);
		}
	}

	onSearch(a: any) {
		this.data.search = a.target.value;
	}

	filteredItems() {
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
		display: flex;
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
