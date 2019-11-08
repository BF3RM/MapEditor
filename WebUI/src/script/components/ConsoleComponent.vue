<template>
	<gl-component>
		<DynamicScroller
				ref="scroller"
				:items="data.logs"
				class="scrollable"
				:min-item-size="30"
				@resize="scrollToBottom()"
		>
			<DynamicScrollerItem
					slot-scope="{ item, index, active }"
					:item="item"
					:active="active"
					:data-index="index"
			>
				<pre v-if="typeof(item.message) == 'string'" @click="onclick" class="message">{{ item.message }}</pre>
			</DynamicScrollerItem>
		</DynamicScroller>
	</gl-component>
</template>
<script lang="ts">
import { Component, Inject, Model, Prop, Watch, Emit } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { LOGLEVEL } from '@/script/modules/Logger';

interface ConsoleEntry {
	level: LOGLEVEL;
	id:number;
	message: string;
	info: any;
}

@Component({ components: { DynamicScroller, DynamicScrollerItem } })
export default class ConsoleComponent extends EditorComponent {
	@Prop() public title!: string;

	private data: {
		logs: ConsoleEntry[];
	} = {
		logs: []
	};

	constructor() {
		super();
		signals.onLog.connect(this.onLog.bind(this));
		this.data.logs.push({
			type: LOGLEVEL.VERBOSE,
			id: this.data.logs.length,
			message: 'test'
		} as ConsoleEntry);
	}
	onclick() {
		window.Log(LOGLEVEL.VERBOSE, 'kek');
		this.scrollToBottom();
	}
	mount() {
		window.onLog = this.onLog.bind(this);
	}
	onLog(logLevel:LOGLEVEL, message: string, info?:any) {
		this.data.logs.push({
			level: logLevel,
			id: this.data.logs.length,
			message: message,
			info
		} as ConsoleEntry);
	}
	scrollToBottom() {
		(this.$refs.scroller as DynamicScroller).scrollToBottom();
	}
}
</script>
<style scoped>
.scrollable {
	height: 100%;
}
</style>
