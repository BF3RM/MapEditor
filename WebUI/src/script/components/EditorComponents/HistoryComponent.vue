<template>
	<EditorComponent id="history-component" title="History">
		<ul class="undos">
			<li
				v-for="undoEntry in undos"
				:key="undoEntry.id"
				class="history-entry"
				:class="{ current: undoEntry.id === currentId }"
				@click="goToState(undoEntry.id)"
			>
				{{ FormatTime(undoEntry.timeStamp) }} - {{ undoEntry.name }}
			</li>
		</ul>
		<ul class="redos">
			<li v-for="redoEntry in redos" :key="redoEntry.id" class="history-entry" @click="goToState(redoEntry.id)">
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

	// Id of the command the scene currently reflects (the newest applied one). Bound as a class in
	// the template. The Gameface port previously marked "current" with a `.undos :last-child` CSS
	// rule — a descendant combinator plus :last-child, both restricted in Cohtml, so the highlight
	// silently disappeared. It also carried no actual notion of the stack pointer. The three.js
	// original this was ported from highlighted by id (outliner.setValue(cmd.id)); this restores
	// that, using only a simple class selector.
	currentId = -1;

	onHistoryChanged() {
		const history = window.editor.history;
		const newUndoCount = history.undos.length;
		this.currentId = newUndoCount > 0 ? history.undos[newUndoCount - 1].id : -1;
		// Only follow the list when a NEW action was appended. Undo/redo and clicking an older
		// entry to time-travel also emit historyChanged; auto-scrolling on those would yank the
		// view back to the bottom right after the user scrolled up to pick an entry.
		// Redoing raises the undo count too, so the count alone can't tell "new action" from
		// "time-travelling back to an entry the user scrolled up to click". History sets
		// timeTravelling for the duration of a goToState walk; never follow the tail then.
		const appended = newUndoCount > this.lastUndoCount && !history.timeTravelling;
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
/* Gameface (Cohtml) restricts descendant combinators and :last-child, so the current step is
   marked with an explicitly bound class instead of inferring it from tree position. */
.history-entry {
	cursor: pointer;
	padding: 2px 6px;
}

.history-entry:hover {
	background-color: rgba(255, 255, 255, 0.06);
}

.history-entry.current {
	background-color: #0a6aa1;
	color: #fff;
}

/* Redone-away entries: dimmed, and separated from the applied ones. */
.redos {
	opacity: 0.6;
	border-top: 1px solid rgba(255, 255, 255, 0.12);
}
</style>
