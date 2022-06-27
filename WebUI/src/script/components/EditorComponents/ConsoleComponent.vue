<template>
	<EditorComponent title="Logs">
		<div class="header">
			<Search @search="onSearch" />
			<div class="rangeHolder">
				<input type="range" min="0" max="6" step="1" :value="data.filterLevel" @input="onUpdateFilter" />
				<div class="logLevel">{{ logLevelDict[data.filterLevel] }}</div>
			</div>
			<!--<div>
				<input id="shouldScrollToBottom" type="checkbox" :checked="data.shouldScrollToBottom" @change="onShouldScrollToBottom"/>
				<label for="shouldScrollToBottom">
					Scroll to bottom
				</label>
			</div>
			-->
		</div>
		<DynamicScroller ref="scroller" :items="filteredItems()" class="scrollable" :min-item-size="20">
			<DynamicScrollerItem
				class="consoleEntry"
				slot-scope="{ item, active }"
				:item="item"
				:active="active"
				@click.native="onClick(item)"
				:size-dependencies="[item.expanded]"
				:min-item-size="20"
			>
				<div :class="'log-wrapper LogLevel-' + logLevelDict[item.level]">
					<div v-if="typeof item.message === 'string'" class="message">
						<span class="log-level">
							{{ logLevelDict[item.level] }}
						</span>
						<span class="log-time">
							{{ FormatTime(item.time) }}
						</span>
						<span class="log-message">
							{{ item.message }}
						</span>
					</div>
					<div v-if="typeof item.message === 'object'" class="message">
						{{ FormatTime(item.time) }} [{{ logLevelDict[item.level] }}]
						{{ item.message.constructor.name }} {{ item.message | json }}
					</div>
					<div v-if="item.expanded" class="stackTrace">
						{{ FormatStacktrace(item) }}
					</div>
				</div>
			</DynamicScrollerItem>
		</DynamicScroller>
	</EditorComponent>
</template>

<script lang="ts">
/* eslint-disable no-unused-vars */

import { Component } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { ConsoleEntry, IConsoleEntry } from '@/script/types/ConsoleEntry';
import Search from '@/script/components/widgets/Search.vue';
import { LOGLEVEL } from '@/script/types/Enums';

@Component({ components: { DynamicScroller, DynamicScrollerItem, Search, EditorComponent } })
export default class ConsoleComponent extends EditorComponent {
	// WTF? What's a better way to do this?
	logLevelDict = ['NONE', 'ERROR', 'PROD', 'WARNING', 'INFO', 'DEBUG', 'VERBOSE'];

	originals: {
		warn: (message?: any, ...optionalParams: any[]) => void;
		log: (message?: any, ...optionalParams: any[]) => void;
		clear: () => void;
		error: (message?: any, ...optionalParams: any[]) => void;
		info: (message?: any, ...optionalParams: any[]) => void;
	} = {
		log: console.log,
		error: console.error,
		warn: console.warn,
		clear: console.clear,
		info: console.info
	};

	data: {
		logs: ConsoleEntry[];
		filterLevel: LOGLEVEL;
		shouldScrollToBottom: boolean;
		search: string;
	} = {
		logs: [],
		filterLevel: LOGLEVEL.VERBOSE,
		shouldScrollToBottom: true,
		search: ''
	};

	mounted() {
		signals.onLog.connect(this.onLog.bind(this));
		window.onLog = this.onLog.bind(this);
		/*
		console.log = this.consoleLog.bind(this);
		console.error = this.consoleError.bind(this);
		console.warn = this.consoleWarn.bind(this);
		console.clear = this.consoleClear.bind(this);
		console.info = this.consoleInfo.bind(this);
		console.log('Initialised console');
		 */
	}

	onClick(item: ConsoleEntry) {
		this.data.logs[item.id].expanded = !item.expanded;
		Object.assign(item, this.data.logs[item.id]);
	}

	Inspect(obj: any) {
		if (obj == null) {
			return 'null';
		}
		return JSON.stringify(obj);
	}

	FormatTime(unixTimestamp: number, type: string = 'timestamp') {
		if (type === 'since') {
			unixTimestamp = Date.now() - unixTimestamp;
		}
		const date = new Date(unixTimestamp);
		const hours = date.getHours();
		const minutes = '0' + date.getMinutes();
		const seconds = '0' + date.getSeconds();

		return hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	}

	FormatStacktrace(item: ConsoleEntry) {
		if (!item.stackTrace) {
			return 'no stack?';
		}
		return item.stackTrace.replace(/webpack-internal:\/\/\//g, '');
	}

	onUpdateFilter(a: any) {
		this.data.filterLevel = a.target.value;
	}

	onSearch(a: any) {
		this.data.search = a.target.value;
	}

	filteredItems() {
		const lowerCaseSearch = this.data.search.toLowerCase();
		return this.data.logs.filter(
			(i) => i.message.toLowerCase().includes(lowerCaseSearch) && i.level <= this.data.filterLevel
		);
	}

	consoleLog(message: any, ...optionalParams: any[]) {
		this.originals.log(message, optionalParams);
		this.data.logs.push(
			new ConsoleEntry({
				message,
				id: this.data.logs.length,
				level: LOGLEVEL.INFO,
				stackTrace: this.StackTrace()
			} as IConsoleEntry)
		);
		this.ScrollToBottom();
	}

	consoleError(message: any, ...optionalParams: any[]) {
		this.originals.error(message, optionalParams);
		this.data.logs.push(
			new ConsoleEntry({
				message,
				id: this.data.logs.length,
				level: LOGLEVEL.ERROR,
				stackTrace: this.StackTrace()
			} as IConsoleEntry)
		);
		this.ScrollToBottom();
	}

	consoleInfo(message: any, ...optionalParams: any[]) {
		this.originals.info(message, optionalParams);
		this.data.logs.push(
			new ConsoleEntry({
				message,
				id: this.data.logs.length,
				level: LOGLEVEL.INFO
			} as IConsoleEntry)
		);
		this.ScrollToBottom();
	}

	consoleWarn(message: any, ...optionalParams: any[]) {
		this.originals.warn(message, optionalParams);
		this.data.logs.push(
			new ConsoleEntry({
				message,
				id: this.data.logs.length,
				level: LOGLEVEL.WARNING
			} as IConsoleEntry)
		);
		this.ScrollToBottom();
	}

	private onLog(logLevel: LOGLEVEL, message: any, info?: any) {
		this.data.logs.push(
			new ConsoleEntry({
				level: logLevel,
				id: this.data.logs.length,
				message,
				info
			} as IConsoleEntry)
		);
		this.ScrollToBottom();
	}

	consoleClear() {
		this.originals.clear();
		this.data.logs = [];
	}

	onShouldScrollToBottom(e: any = 'wtf') {
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
		const lines = err.stack.split('\n');
		lines.splice(0, 3);
		return lines.join('\n');
	}
}
</script>
<style lang="scss" scoped>
.header {
	.rangeHolder {
		position: relative;

		.logLevel {
			text-align: center;
			font-weight: 600;
			color: #fff;
			font-size: 12px;
			position: absolute;
			left: 50%;
			transform: translateX(-50%);
		}
	}
}

.consoleEntry {
	padding: 0 7px;
	background: transparent;
	min-height: 20px;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	width: 100%;

	.log-wrapper {
		width: 100%;

		.log-level {
			font-size: 10px;
			border-radius: 6px;
			padding: 0 5px;
			background: rgb(87, 87, 87);
			color: #fff;
			margin-right: 5px;
		}

		.log-time {
			color: #fff;
			opacity: 0.25;
		}

		.log-message {
			color: #fff;
		}

		&.LogLevel-ERROR {
			.log-level {
				background: rgb(255, 45, 45);
			}
		}

		&.LogLevel-WARNING {
			.log-level {
				background: rgb(255, 223, 45);
			}
		}
	}
}

.stackTrace {
	margin: 7px 0;
	width: 100%;
	background: #161924;
	padding: 7px;
	border-radius: 6px;
	box-sizing: border-box;
}
</style>
