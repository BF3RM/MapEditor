<template>
    <EditorComponent id="history-component" title="History">
        <ul class="undos">
            <li v-for="(undoEntry, index) in undos" :key="index" @click="goToState(undoEntry.id)">
                {{undoEntry.name}}
            </li>
		</ul>
		<ul class="redos" v-if="redos.length > 0">
			<li v-for="(redoEntry, index) in redos" :key="index" @click="goToState(redoEntry.id)">
				{{redoEntry.name}}
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
@Component({ components: { EditorComponent } })

export default class HistoryComponent extends EditorComponent {
	constructor() {
		super();
		signals.historyChanged.connect(this.onHistoryChanged.bind(this));
	}

	get undos():Command[] {
		return window.editor.history.undos;
	}

	get redos():Command[] {
		return window.editor.history.redos;
	}

	onHistoryChanged() {
		this.$forceUpdate();
		// console.log(this.undos.length);
		// console.log(this.redos.length);
		// console.log('update');
	}

	goToState(id: number) {
		window.editor.history.goToState(id);
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

<style lang="scss">
</style>
