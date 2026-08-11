<template>
	<EditorComponent id="history-component" title="History">
		<ul class="undos">
			<li v-for="(undoEntry, index) in undos" :key="index" @click="goToState(undoEntry.id)">
				{{ FormatTime(undoEntry.timeStamp) }} - {{ undoEntry.name }}
			</li>
		</ul>
		<ul class="redos">
			<li v-for="(redoEntry, index) in redos" :key="index" @click="goToState(redoEntry.id)">
				{{ FormatTime(redoEntry.timeStamp) }} - {{ redoEntry.name }}
			</li>
		</ul>
	</EditorComponent>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { signals } from '@/script/modules/Signals';
import Command from '@/script/libs/three/Command';
@Component({
	components: {
		EditorComponent
	}
})
export default class HistoryComponent extends EditorComponent {
	mounted() {
		signals.historyChanged.connect(this.onHistoryChanged.bind(this));
	}

	undos: Command[] = [];
	redos: Command[] = [];

	// Tracked separately because `this.undos` is the SAME array instance as
	// `window.editor.history.undos` (History pushes/pops it in place), so its length can't be
	// diffed across the assignment below.
	private lastUndoCount = 0;

	onHistoryChanged() {
		const newUndoCount = window.editor.history.undos.length;
		// Only follow the list when a NEW action was appended. Undo/redo and clicking an older
		// entry to time-travel also emit historyChanged; auto-scrolling on those would yank the
		// view back to the bottom right after the user scrolled up to pick an entry.
		const appended = newUndoCount > this.lastUndoCount;
		this.lastUndoCount = newUndoCount;

		this.undos = window.editor.history.undos;
		this.redos = window.editor.history.redos.slice().reverse();

		if (appended) {
			this.$nextTick(() => this.scrollToLatest());
		}
	}

	// Gameface: scrollIntoView is unreliable, so set scrollTop on the scrolling container
	// (EditorComponent's .panel-body) directly.
	private scrollToLatest() {
		const body = this.$el ? (this.$el.querySelector('.panel-body') as HTMLElement | null) : null;

		if (body) {
			body.scrollTop = body.scrollHeight;
		}
	}

	goToState(id: number) {
		console.log(id);
		window.editor.history.goToState(id);
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
