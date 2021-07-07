<template>
    <EditorComponent id="history-component" title="History">
        <ul class="undos">
            <li v-for="(undoEntry, index) in undos" :key="index" @click="goToState(undoEntry.id)">
				{{FormatTime(undoEntry.timeStamp)}} - {{undoEntry.name}}
            </li>
		</ul>
		<ul class="redos">
			<li v-for="(redoEntry, index) in redos" :key="index" @click="goToState(redoEntry.id)">
				{{FormatTime(redoEntry.timeStamp)}} - {{redoEntry.name}}
			</li>
		</ul>
    </EditorComponent>
</template>

<script lang="ts">
import { Component, Prop, PropSync } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { signals } from '@/script/modules/Signals';
import Command from '@/script/libs/three/Command';
import { Computed } from 'vuex/types/helpers';
@Component({
	components: {
		EditorComponent
	}
})
export default class HistoryComponent extends EditorComponent {
	constructor() {
		super();
		signals.historyChanged.connect(this.onHistoryChanged.bind(this));
	}

	undos: Command[] = [];
	redos: Command[] = [];

	onHistoryChanged() {
		this.undos = window.editor.history.undos;
		this.redos = window.editor.history.redos.slice().reverse();
	}

	goToState(id: number) {
		console.log(id);
		window.editor.history.goToState(id);
	}

	private FormatTime(unixTimestamp: number, type: string = 'timestamp') {
		if (type === 'since') {
			unixTimestamp = Date.now() - unixTimestamp;
		}
		const date = new Date(unixTimestamp);
		const hours = date.getHours();
		const minutes = '0' + date.getMinutes();
		const seconds = '0' + date.getSeconds();

		return hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	}

	/*
	onHistoryChanged(cmd: Command) {
		const scope = this;
		scope.dom.html('');
		for (let i = 0; i < history.undos.length; i++) {
			const entry = document.createElement('li');
			entry.className += 'undo';
			entry.innerText = (history.undos[i].name);
			entry.attr('historyStep', history.undos[i].id);
			scope.dom.append(entry);

			entry.on('click', function (e) {
				editor.history.goToState(parseInt(this.getAttribute('historyStep')));
			});
		}

		for (let i = history.redos.length - 1; i >= 0; i--) {
			const entry = document.createElement('li');
			entry.addClass('redo');
			entry.text(history.redos[i].name);
			entry.attr('historyStep', history.redos[i].id);
			scope.dom.append(entry);

			entry.on('click', function (e) {
				editor.history.goToState(parseInt(this.getAttribute('historyStep')));
			});
		}
	}
    */
}
</script>

<style lang="scss" scoped>
	.undos {
		:last-child {
			background-color: #0a6aa1;
		}
	}
	.redos {
		opacity: 0.6;
	}
</style>
