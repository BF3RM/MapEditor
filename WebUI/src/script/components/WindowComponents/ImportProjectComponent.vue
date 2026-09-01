<template>
	<WindowComponent :visible="state.visible" :title="title" :isDestructible="true" @update:visible="Close">
		<div class="container">
			<div class="alert" v-if="displayMessage">
				{{ displayMessage }}
			</div>
			<div class="alert alert-success" v-else>Paste the save JSON into the text area.</div>
			<div class="textarea-wrapper">
				<!-- Gameface port: a big save (200k+ lines) pasted into a v-model textarea makes
				     Cohtml lay out the whole text and CRASH the client. So we intercept the paste,
				     keep the full JSON in a NON-reactive var (never in the DOM), and only show a
				     short summary here. `:value` is one-way; @input covers small manual edits. -->
				<textarea
					:value="displayValue"
					@paste="onPaste"
					@input="onInput"
					placeholder="Paste the save JSON here"
				/>
			</div>
		</div>
		<div class="footer">
			<button @click="Close" class="btn btn-lg btn-dark">Close</button>
			<button @click="Import" class="btn btn-lg btn-dark">Import</button>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import WindowComponent from './WindowComponent.vue';
import { RequestImportProjectMessage } from '@/script/messages/MessagesIndex';

import { signals } from '@/script/modules/Signals';

export default defineComponent({
	name: 'ImportProjectComponent',
	components: {
		WindowComponent
	},
	data() {
		return {
			title: 'Import Project',
			displayMessage: '',
			displayValue: '', // what the textarea shows (kept SMALL — a summary for big pastes)
			state: {
				visible: false
			}
		};
	},
	methods: {
		// Store the full JSON off the DOM/reactivity. Big saves shown in a textarea crash Cohtml,
		// so keep the full string here and only render a short summary.
		setFull(text: string) {
			(this as any)._fullJSON = text || '';
			const n = (this as any)._fullJSON.length;
			if (n > 4000) {
				let lines = 1;
				for (let i = 0; i < n; i++) {
					if (text.charCodeAt(i) === 10) lines++;
				}
				this.displayValue =
					'✓ Pasted ' +
					n.toLocaleString() +
					' characters (' +
					lines.toLocaleString() +
					' lines). Press Import.';
			} else {
				this.displayValue = (this as any)._fullJSON;
			}
		},
		onPaste(e: ClipboardEvent) {
			// Read the clipboard ourselves and DON'T let the huge text reach the DOM textarea.
			e.preventDefault();
			const cd = e.clipboardData || (window as any).clipboardData;
			const text = cd ? cd.getData('text') : '';
			this.setFull(text);
		},
		onInput(e: any) {
			// Small manual edits/typing only (a paste is intercepted above).
			this.setFull(e && e.target ? e.target.value : '');
		},
		isValidJSON(str: string) {
			try {
				JSON.parse(str);
			} catch (e) {
				return false;
			}
			return true;
		},
		Import() {
			const json = ((this as any)._fullJSON as string) || this.displayValue || '';
			if (this.isValidJSON(json)) {
				this.displayMessage = 'Valid text format, validating...';
				window.vext.SendMessage(new RequestImportProjectMessage(json));
			} else {
				this.displayMessage = 'Invalid text format';
			}
		},
		ProjectImportFinished(msg: string) {
			this.displayMessage = msg;
		},
		Close() {
			this.state.visible = false;
			this.displayMessage = '';
			this.displayValue = '';
			(this as any)._fullJSON = '';
		}
	},
	mounted() {
		signals.menuRegistered.emit(['File', 'Import Project'], () => {
			this.title = 'Import Project';
			this.state.visible = true;
		});
		signals.projectImportFinished.connect(this.ProjectImportFinished.bind(this));
	}
});
</script>

<style lang="scss" scoped>
.container {
	display: flex;
	flex-direction: column;

	.textarea-wrapper {
		flex: 1 1 auto;

		textarea {
			width: 100%;
			height: 100%;
			box-sizing: border-box;
			resize: none;
		}
	}

	.alert {
		margin-bottom: 7px;
	}
}
</style>
