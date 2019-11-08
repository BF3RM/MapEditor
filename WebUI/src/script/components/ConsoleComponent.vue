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
				<pre v-if="typeof(item.message) === 'string'" @click="onclick" class="message">string [{{item.level}}] {{ item.message }}</pre>
				<pre v-if="typeof(item.message) === 'object'" @click="onclick" class="message">object [{{item.level}}] {{ Inspect(item.message) }}</pre>
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
import { inspect } from 'util';

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

	private originals: {
		warn: (message?: any, ...optionalParams: any[]) => void;
		log: (message?: any, ...optionalParams: any[]) => void;
		clear: () => void;
		error: (message?: any, ...optionalParams: any[]) => void;
		info: (message?: any, ...optionalParams: any[]) => void
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
		console.log('kek');
		this.scrollToBottom();
	}
	Inspect(obj:any) {
		if (obj == null) {
			return 'null';
		}
		return inspect(obj);
	}
	mounted() {
		this.originals = {
			log: console.log,
			error: console.error,
			warn: console.warn,
			clear: console.clear,
			info: console.info
		};
		window.onLog = this.onLog.bind(this);
		console.log = this.consoleLog.bind(this);
		console.error = this.consoleError.bind(this);
		console.warn = this.consoleWarn.bind(this);
		console.clear = this.consoleClear.bind(this);
		console.info = this.consoleInfo.bind(this);
		console.log('Initialised console');
	}

	consoleLog(message?: any, ...optionalParams: any[]) {
		if (optionalParams.length === 0) {
			optionalParams = null;
		}		this.originals.log(message, optionalParams);
		this.data.logs.push({
			message: message,
			id: this.data.logs.length,
			level: LOGLEVEL.INFO
		} as ConsoleEntry);
	}
	consoleError(message?: any, ...optionalParams: any[]) {
		if (optionalParams.length === 0) {
			optionalParams = null;
		}		this.originals.error(message, optionalParams);
		this.data.logs.push({
			message: message,
			id: this.data.logs.length,
			level: LOGLEVEL.ERROR
		} as ConsoleEntry);
	}
	consoleInfo(message?: any, ...optionalParams: any[]) {
		if (optionalParams.length === 0) {
			optionalParams = null;
		}
		this.originals.info(message, optionalParams);
		this.data.logs.push({
			message: message,
			id: this.data.logs.length,
			level: LOGLEVEL.INFO
		} as ConsoleEntry);
	}
	consoleWarn(message?: any, ...optionalParams: any[]) {
		if (optionalParams.length === 0) {
			optionalParams = null;
		}
		this.originals.warn(message, optionalParams);
		this.data.logs.push({
			message: message,
			id: this.data.logs.length,
			level: LOGLEVEL.WARNING
		} as ConsoleEntry);
	}
	consoleClear() {
		this.originals.clear();
		this.data.logs = [];
	}

	onLog(logLevel:LOGLEVEL, message: any, info?:any) {
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
