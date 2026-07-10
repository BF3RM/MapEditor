<template>
	<EditorComponent class="grid-component" :title="title">
		<div class="header">
			<Search v-model="data.search" @search="onSearch" />
			<!-- Gameface port: native range sliders don't render (webkit thumb) -> div slider. -->
			<div class="fx-slider" @mousedown="onSliderDown">
				<div class="fx-slider-track"></div>
				<div class="fx-slider-handle" :style="{ left: sliderPct + '%' }"></div>
			</div>
		</div>
		<div class="container scrollable" ref="scroller">
			<!-- Gameface port: Cohtml 2.2.7 supports NEITHER `flex-wrap` NOR `inline-block`
			     wrapping (items either overflow in one row or stack in one column). Plain
			     flex-ROW works though, so we wrap manually: measure the panel width, compute
			     how many columns fit for the current icon size, chunk the items into rows,
			     and render each row as its own flex-row. Bigger icons => wider items =>
			     fewer columns (and vice-versa), driven by the slider. -->
			<!-- Gameface port: activation via a DELEGATED mousedown listener on the stable
			     scroll container (see mounted). Per-item @click is unreliable in Cohtml
			     (same intermittent-drop bug as the trees). data-idx maps a click back to
			     the filtered item. -->
			<template v-if="data.scale > 5">
				<div class="grid-row" v-for="(row, ri) in rows" :key="ri">
					<div
						class="grid-item"
						:style="{ width: itemWidth + 'px' }"
						v-for="(item, ci) in row"
						:key="ri + '-' + ci"
						:data-idx="ri * columns + ci"
						v-tooltip="item.fileName || item.name"
					>
						<slot name="grid" :item="item" :data="data" :iconSize="iconSize"></slot>
					</div>
				</div>
			</template>
			<div class="list-container" v-else>
				<div class="tr" v-for="(item, index) in filtered" :key="index" :data-idx="index">
					<slot name="list" :item="item" :data="data"></slot>
				</div>
			</div>
		</div>
	</EditorComponent>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import Search from '@/script/components/widgets/Search.vue';
import { Blueprint } from '@/script/types/Blueprint';
import Highlighter from '@/script/components/widgets/Highlighter.vue';

@Component({
	components: { Highlighter, Search, EditorComponent }
})
export default class GridComponent extends EditorComponent {
	@Prop(Array) list: { name: string }[];
	@Prop(String) keyField: string;
	@Prop(Array) headers: string[];
	@Prop(Function) click: void;
	@Prop(Boolean) rightAlign: boolean;

	data: {
		search: string;
		scale: number;
	} = {
		search: '',
		scale: 6
	};

	// Measured width of the scroll area, used to compute the column count (reactive).
	private containerWidth = 0;

	mounted() {
		this.$nextTick(() => this.measure());
		window.addEventListener('resize', this.measure);
		// Delegated activation on the stable scroll container (per-item listeners drop
		// clicks in Gameface). mousedown only -> exactly one spawn per press (no double).
		const sc = this.$refs.scroller as HTMLElement;
		if (sc) {
			sc.addEventListener('mousedown', this.onGridActivate);
		}
	}

	beforeDestroy() {
		window.removeEventListener('resize', this.measure);
		const sc = this.$refs.scroller as HTMLElement;
		if (sc) {
			sc.removeEventListener('mousedown', this.onGridActivate);
		}
	}

	private onGridActivate = (e: MouseEvent) => {
		if (e.button !== undefined && e.button !== 0) {
			return; // left button only
		}
		let t = e.target as HTMLElement | null;
		const root = this.$refs.scroller as HTMLElement;
		let el: HTMLElement | null = null;
		while (t && t !== root) {
			if (t.getAttribute && t.getAttribute('data-idx') !== null) {
				el = t;
				break;
			}
			t = t.parentElement;
		}
		if (!el) {
			return;
		}
		const idx = parseInt(el.getAttribute('data-idx') || '-1', 10);
		const item = this.filtered[idx];
		if (!item) {
			return;
		}
		this.onClick(item);
	};

	updated() {
		// Catch panel (dock) resizes. Guarded by equality so it converges (no loop).
		this.measure();
	}

	measure() {
		const el = this.$refs.scroller as HTMLElement;
		if (el && el.clientWidth && el.clientWidth !== this.containerWidth) {
			this.containerWidth = el.clientWidth;
		}
	}

	// Icon size (px) from the scale slider.
	get iconSize(): number {
		switch (this.data.scale) {
			case 7:
				return 60;
			case 8:
				return 80;
			case 9:
				return 100;
			case 10:
				return 120;
			default:
				return 40;
		}
	}

	// Filtered list (reactive computed).
	get filtered(): Blueprint[] {
		if (this.list === undefined) {
			return [];
		}
		const s = this.data.search.toLowerCase();
		if (s === '') {
			return this.list as Blueprint[];
		}
		return (this.list as Blueprint[]).filter((i) => i.name.toLowerCase().includes(s));
	}

	// Item width: at least a comfortable label width so the name shows without needing
	// the tooltip (like the original), but grows with the icon for the bigger scales.
	get itemWidth(): number {
		return Math.max(this.iconSize + 20, 104);
	}

	// Columns that fit at the current item width / panel width.
	get columns(): number {
		const itemOuter = this.itemWidth + 10; // item width + 5px margin each side
		const avail = (this.containerWidth || 300) - 12; // container padding
		return Math.max(1, Math.floor(avail / itemOuter));
	}

	// Items chunked into rows of `columns` (manual wrap — see template note).
	get rows(): Blueprint[][] {
		const items = this.filtered;
		const cols = this.columns;
		const out: Blueprint[][] = [];
		for (let i = 0; i < items.length; i += cols) {
			out.push(items.slice(i, i + cols));
		}
		return out;
	}

	onMouseDown(e: any, item: Blueprint) {
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

	get sliderPct(): number {
		return ((this.data.scale - 5) / 5) * 100;
	}

	onSliderDown(e: MouseEvent) {
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		const set = (ev: MouseEvent) => {
			if (ev.buttons === 0) {
				up();
				return;
			}
			let frac = (ev.clientX - rect.left) / rect.width;
			frac = Math.max(0, Math.min(1, frac));
			this.data.scale = 5 + Math.round(frac * 5);
		};
		set(e);
		const up = () => {
			document.removeEventListener('mousemove', set);
			document.removeEventListener('mouseup', up);
		};
		document.addEventListener('mousemove', set);
		document.addEventListener('mouseup', up);
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
	.name {
		text-align: center;
	}
}

.container {
	position: relative;
}

.rightAlign {
	text-align: right;
}
</style>
<style lang="scss">
/* Gameface port: NOT scoped (GridComponent extends EditorComponent, which breaks the
   scoped-attribute match). Prefixed with .grid-component so it only affects this panel. */
.grid-component .container.scrollable {
	height: 100%;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 6px;
	box-sizing: border-box;
}
/* Manual grid: each row is a plain flex-row (flex-wrap/inline-block don't work in
   Cohtml, but flex-row does). */
.grid-component .grid-row {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
}
.grid-component .grid-item {
	width: 54px;
	margin: 5px;
	padding-bottom: 4px;
	text-align: center;
	cursor: pointer;
	font-size: 11px;
	color: #dfe4ea;
	overflow: hidden;
	word-break: break-word;
	box-sizing: border-box;
	flex: 0 0 auto;
}
.grid-component .grid-item .Icon {
	display: block;
	margin: 0 auto;
}
.grid-component .grid-item .name {
	width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.grid-component .header {
	display: flex;
	align-items: center;
}
.grid-component .header .search {
	flex: 1 1 auto;
	min-width: 0;
}
/* Custom div slider (native range doesn't render in Gameface). */
.grid-component .fx-slider {
	position: relative;
	width: 90px;
	height: 16px;
	flex: 0 0 90px;
	cursor: pointer;
	margin-left: 8px;
}
.grid-component .fx-slider-track {
	position: absolute;
	top: 6px;
	left: 0;
	right: 0;
	height: 4px;
	background: #161924;
	border-radius: 2px;
}
.grid-component .fx-slider-handle {
	position: absolute;
	top: 1px;
	width: 10px;
	height: 14px;
	background: #fff;
	border-radius: 3px;
	transform: translateX(-50%);
}
/* List mode (slider at minimum). */
.grid-component .list-container .tr {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 3px 10px;
	cursor: pointer;
	font-size: 12px;
	color: #dfe4ea;
	height: 26px;
	box-sizing: border-box;
}
.grid-component .list-container .tr:hover {
	background: #2a3242;
}
.grid-component .list-container .tr .Icon {
	width: 16px;
	height: 16px;
	flex: 0 0 16px;
}
.grid-component .list-container .tr .name {
	flex: 1 1 auto;
	min-width: 0;
}
.grid-component .list-container .tr .type {
	color: #409eff;
	margin-left: auto;
}
</style>
