<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true">
		<div class="container">
			<textarea v-model="projectDataJSON"/>
			<span>{{ displayMessage }}</span>
		</div>
		<div class="footer">
			<div>
				<button @click="Import">Import</button>
				<button @click="Close">Close</button>
			</div>
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
	private title = 'Import Project';
	private displayMessage = '';
	private projectDataJSON = '';
	private state = {
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
	}
}
</script>
<style lang="scss" scoped>
.container{
	display: grid;
	min-width: 30vmin;
	min-height: 20vmin;
}
.projectList {
	grid-column: 1;
	padding: 5px;

}
.saveList {
	grid-column: 2;
	padding: 5px;
}

.saveInfo{
	background-color: #2e2e2e;
	padding: 8px;
	width: available;
	display: flex;
	flex-direction: column;
}

.selected {
	background-color: #404040;
	color: #FAB91E;
}
</style>
