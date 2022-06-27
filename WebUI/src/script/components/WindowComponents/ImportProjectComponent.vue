<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true">
		<div class="container">
			<div class="alert" v-if="displayMessage">
				{{ displayMessage }}
			</div>
			<div class="alert alert-success" v-else>Paste the save JSON into the text area.</div>
			<div class="textarea-wrapper">
				<textarea v-model="projectDataJSON" />
			</div>
		</div>
		<div class="footer">
			<button @click="Close" class="btn btn-lg btn-dark">Close</button>
			<button @click="Import" class="btn btn-lg btn-dark">Import</button>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WindowComponent from './WindowComponent.vue';
import { RequestImportProjectMessage } from '@/script/messages/MessagesIndex';

import { signals } from '@/script/modules/Signals';

@Component({ components: { WindowComponent } })
export default class ImportProjectComponent extends Vue {
	title = 'Import Project';
	displayMessage = '';
	projectDataJSON = '';
	state = {
		visible: false
	};

	mounted() {
		signals.menuRegistered.emit(['File', 'Import Project'], () => {
			this.title = 'Import Project';
			this.state.visible = true;
		});
		signals.projectImportFinished.connect(this.ProjectImportFinished.bind(this));
	}

	isValidJSON(str: string) {
		try {
			JSON.parse(str);
		} catch (e) {
			return false;
		}
		return true;
	}

	Import() {
		if (this.isValidJSON(this.projectDataJSON)) {
			this.displayMessage = 'Valid text format, validating...';
			window.vext.SendMessage(new RequestImportProjectMessage(this.projectDataJSON));
		} else {
			this.displayMessage = 'Invalid text format';
		}
	}

	ProjectImportFinished(msg: string) {
		this.displayMessage = msg;
	}

	Close() {
		this.state.visible = false;
		this.displayMessage = '';
	}
}
</script>
<style lang="scss" scoped>
.container {
	display: flex;
	flex-flow: column;

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
