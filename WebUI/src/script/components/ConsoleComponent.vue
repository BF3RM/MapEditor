<template>
	<gl-component>
		<div class="header">
			<input type="range" min="0" max="6" step="1" :value="data.filterLevel" @input="onUpdateFilter">
			<div class="logLevel">{{data.filterLevel}} - {{logLevelDict[data.filterLevel]}}</div>
			<input id="shouldScrollToBottom" type="checkbox" :checked="data.shouldScrollToBottom" @change="onShouldScrollToBottom"/>
			<label for="shouldScrollToBottom">
				Scroll to bottom?
			</label>
			<input type="input" :value="data.search" @input="onSearch" placeholder="search">
		</div>
		<DynamicScroller
				ref="scroller"
				:items="filteredItems()"
				class="scrollable"
				:min-item-size="30"
		>
			<DynamicScrollerItem
					class="consoleEntry"
					slot-scope="{ item, index, active }"
					:item="item"
					:active="active"
					:data-index="index"
					@click.native="onClick(item)"
					:size-dependencies="[item.expanded]"
					:min-item-size="30"
			>
				<div :class="'LogLevel-' + logLevelDict[item.level]">
					<pre v-if="typeof(item.message) === 'string'" class="message">{{FormatTime(item.time)}} [{{item.level}}] {{ item.message }}</pre>
					<pre v-if="typeof(item.message) === 'object'" class="message">{{FormatTime(item.time)}} [{{item.level}}] {{item.message.constructor.name}} {{ Inspect(item.message) }}</pre>
					<pre v-if="item.expanded" class="stackTrace">{{FormatStacktrace(item)}}</pre>
				</div>
			</DynamicScrollerItem>
		</DynamicScroller>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { LOGLEVEL } from '@/script/modules/Logger';
import { inspect } from 'util';
import { ConsoleEntry, IConsoleEntry } from '@/script/types/ConsoleEntry';

@Component({ components: { DynamicScroller, DynamicScrollerItem } })
export default class ConsoleComponent extends EditorComponent {
	@Prop() public title!: string;
	// WTF? What's a better way to do this?
	private logLevelDict = [
		'NONE',
		'ERROR',
		'PROD',
		'WARNING',
		'INFO',
		'DEBUG',
		'VERBOSE'
	];

	private originals: {
		warn: (message?: any, ...optionalParams: any[]) => void;
		log: (message?: any, ...optionalParams: any[]) => void;
		clear: () => void;
		error: (message?: any, ...optionalParams: any[]) => void;
		info: (message?: any, ...optionalParams: any[]) => void
	} = {
		log: console.log,
		error: console.error,
		warn: console.warn,
		clear: console.clear,
		info: console.info
	};

	private data: {
		logs: ConsoleEntry[];
		filterLevel: LOGLEVEL;
		shouldScrollToBottom: boolean;
		search: string
	} = {
		logs: [],
		filterLevel: LOGLEVEL.VERBOSE,
		shouldScrollToBottom: true,
		search: ''
	};

	constructor() {
		super();
		signals.onLog.connect(this.onLog.bind(this));
	}

	public mounted() {
		window.onLog = this.onLog.bind(this);
		console.log = this.consoleLog.bind(this);
		console.error = this.consoleError.bind(this);
		console.warn = this.consoleWarn.bind(this);
		console.clear = this.consoleClear.bind(this);
		console.info = this.consoleInfo.bind(this);
		console.log('Initialised console');
	}

	private onClick(item: ConsoleEntry) {
		this.data.logs[item.id].expanded = !item.expanded;
		Object.assign(item, this.data.logs[item.id]);
	}

	private Inspect(obj: any) {
		if (obj == null) {
			return 'null';
		}
		return inspect(obj);
	}

	private FormatTime(unixTimestamp: number, type: string = 'timestamp') {
		if (type === 'since') {
			unixTimestamp = Date.now() - unixTimestamp;
		}
		const date = new Date(unixTimestamp);
		const hours = date.getHours() - 1;
		const minutes = '0' + date.getMinutes();
		const seconds = '0' + date.getSeconds();

		return hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	}

	private FormatStacktrace(item: ConsoleEntry) {
		if (!item.stackTrace) {
			return 'no stack?';
		}
		return item.stackTrace.replace(/webpack-internal:\/\/\//g, '');
	}

	private onUpdateFilter(a: any) {
		this.data.filterLevel = a.target.value;
	}

	private onSearch(a: any) {
		this.data.search = a.target.value;
	}

	private filteredItems() {
		const lowerCaseSearch = this.data.search.toLowerCase();
		return this.data.logs.filter((i) => i.message.toLowerCase().includes(lowerCaseSearch) && i.level <= this.data.filterLevel);
	}

	private consoleLog(message: any, ...optionalParams: any[]) {
		this.originals.log(message, optionalParams);
		this.data.logs.push(new ConsoleEntry({
			message,
			id: this.data.logs.length,
			level: LOGLEVEL.INFO,
			stackTrace: this.StackTrace()
		} as IConsoleEntry));
		this.ScrollToBottom();
	}

	private consoleError(message: any, ...optionalParams: any[]) {
		this.originals.error(message, optionalParams);
		this.data.logs.push(new ConsoleEntry({
			message,
			id: this.data.logs.length,
			level: LOGLEVEL.ERROR,
			stackTrace: this.StackTrace()
		} as IConsoleEntry));
		this.ScrollToBottom();
	}

	private consoleInfo(message: any, ...optionalParams: any[]) {
		this.originals.info(message, optionalParams);
		this.data.logs.push(new ConsoleEntry({
			message,
			id: this.data.logs.length,
			level: LOGLEVEL.INFO
		} as IConsoleEntry));
		this.ScrollToBottom();
	}

	private consoleWarn(message: any, ...optionalParams: any[]) {
		this.originals.warn(message, optionalParams);
		this.data.logs.push(new ConsoleEntry({
			message,
			id: this.data.logs.length,
			level: LOGLEVEL.WARNING
		} as IConsoleEntry));
		this.ScrollToBottom();
	}

	private onLog(logLevel: LOGLEVEL, message: any, info?: any) {
		this.data.logs.push(new ConsoleEntry({
			level: logLevel,
			id: this.data.logs.length,
			message,
			info
		} as IConsoleEntry));
		this.ScrollToBottom();
	}

	private consoleClear() {
		this.originals.clear();
		this.data.logs = [];
	}

	private onShouldScrollToBottom(e: any = 'wtf') {
		this.data.shouldScrollToBottom = e.target.checked;
	}

	private ScrollToBottom() {
		if (this.data.shouldScrollToBottom && this.$refs.scroller !== undefined) {
			(this.$refs.scroller as DynamicScroller).scrollToBottom();
		}
	}

	private StackTrace() {
		const err = new Error();
		if (err.stack === undefined) {
			return '';
		}
		// Is this really correct TSLinter?
		const lines = err.stack.split('\n');
		lines.splice(0, 3);
		return lines.join('\n');
	}
}
</script>
<style scoped>
.LogLevel-ERROR {
	background-color: red;
}
.header {
	display:flex;
}
.scrollable {
	height: 100%;
}
.consoleEntry {
	border-bottom: 1px solid;
	padding-top: 5px;
}

pre.stackTrace {
	background-color: #11111199;
	padding-bottom: 5px;
	padding-top: 5px;

}
pre.message {
	background-color: #24242499;
	padding-bottom: 5px;
}
</style>
