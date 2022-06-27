<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true">
		<template v-if="showNewSave">
			<div class="container new-container">
				<div class="alert" v-if="hint">
					{{ hint }}
				</div>
				<input placeholder="Project Name" v-model="newSaveName" class="input-large" />
			</div>
			<div class="footer">
				<button @click="showNewSave = false" class="btn btn-lg btn-dark">Cancel</button>
				<button @click="Save(true)" class="btn btn-lg btn-success">Save</button>
			</div>
		</template>
		<template v-else-if="showExportWindow">
			<div class="container export-container">
				<div class="alert alert-success">
					{{ hint }}
				</div>
				<textarea
					class="projectDataInput"
					readonly
					placeholder="Loading..."
					@focus="$event.target.select()"
					v-model="projectData"
				/>
			</div>
			<div class="footer">
				<button @click="CloseExportWindow" class="btn btn-lg btn-dark">Cancel</button>
			</div>
		</template>
		<template v-else>
			<div class="container">
				<div class="saves-wrapper">
					<div class="list-wrapper">
						<ul class="project-list">
							<li v-if="projects.length === 0">No saved projects</li>
							<li
								v-else
								v-for="(project, projectName) in projects"
								v-bind:key="projectName"
								@click="onSelectProject(projectName)"
								:class="{
									selected: selectedProjectName === projectName,
									current: currentProjectHeader.projectName === projectName
								}"
							>
								{{ projectName }}
							</li>
						</ul>
					</div>
					<div class="list-wrapper">
						<ul v-if="selectedProject" class="save-list">
							<li
								v-for="(save, index) in selectedProject"
								v-bind:key="save.timeStamp"
								@click="selectSave(index)"
								:class="{
									selected: selectedSave && selectedSave.timeStamp === save.timeStamp,
									current: save.timeStamp === currentProjectHeader.timeStamp
								}"
							>
								{{ FormatTime(save.timeStamp) }}
							</li>
						</ul>
					</div>
				</div>
				<div class="alert alert-success" v-if="selectedSave">
					<span>Selected save info:</span>
					Map name: {{ selectedSave.mapName }}
					<span v-if="selectedSave">Gamemode: {{ selectedSave.gameModeName }}</span>
					<!--<span v-if="selectedSave">Bundles: {{selectedSave.requiredBundles}}</span>-->
				</div>
			</div>
			<div class="footer">
				<button @click="Close" class="btn btn-lg btn-dark">Close</button>
				<button :disabled="buttonsDisabled" @click="Export" class="btn btn-lg btn-dark">Export</button>
				<button :disabled="buttonsDisabled" @click="Delete" class="btn btn-lg btn-danger">Delete</button>
				<button @click="NewSave()" class="btn btn-lg btn-dark">New Save</button>
				<button :disabled="buttonsDisabled" @click="loadSave()" class="btn btn-lg btn-success">Load</button>
			</div>
		</template>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WindowComponent from './WindowComponent.vue';
import {
	GetProjectsMessage,
	RequestSaveProjectMessage,
	RequestDeleteProjectMessage,
	RequestLoadProjectMessage,
	RequestProjectDataMessage
} from '@/script/messages/MessagesIndex';
import { signals } from '@/script/modules/Signals';
import { Log } from '@/script/modules/Logger';
import { LOGLEVEL } from '@/script/types/Enums';

@Component({ components: { WindowComponent } })
export default class ProjectSettingsComponent extends Vue {
	title = 'Project Settings';
	projects = {};
	selectedProjectName: string = '';
	selectedSaveIndex: number = 0;
	showNewSave = false;
	showExportWindow = false;
	projectData = '';

	hint = '';
	state = {
		visible: false
	};

	get projectsArray() {
		return Object.values(this.projects);
	}

	get selectedProject(): object[] | null {
		return (this.projects as any)[this.selectedProjectName];
	}

	get selectedSave(): object | null {
		const project = this.selectedProject;
		if (project) {
			return (project as any)[this.selectedSaveIndex];
		}
		return null;
	}

	get buttonsDisabled() {
		return this.projectsArray.length === 0 || this.selectedProject === null || this.selectedSave == null;
	}

	get newSaveName() {
		return (this.currentProjectHeader as any).projectName;
	}

	set newSaveName(value: string) {
		(this.currentProjectHeader as any).projectName = value;
	}

	currentProjectHeader = {
		projectName: '',
		timeStamp: 0
	};

	NotImplemented() {
		console.error('Not implemented');
	}

	mounted() {
		signals.saveRequested.connect(this.Save.bind(this));
		signals.setProjectHeaders.connect(this.onGetProjects.bind(this));
		signals.menuRegistered.emit(['File', 'Save as'], () => {
			this.showNewSave = true;
			this.title = 'New Project';
			this.state.visible = true;
		});
		signals.menuRegistered.emit(['File', 'Project Settings'], () => {
			window.vext.SendMessage(new GetProjectsMessage());
			this.showNewSave = false;
			this.title = 'Project Settings';
			this.state.visible = true;
		});
		signals.setCurrentProjectHeader.connect((projectHeader) => {
			this.hint = '';
			this.currentProjectHeader = projectHeader;
			this.selectedProjectName = projectHeader.projectName;
			Log(LOGLEVEL.INFO, 'Loaded project: ' + projectHeader.projectName);
			if (projectHeader.projectName !== 'Untitled Project') {
				signals.menuRegistered.emit(['File', 'Save'], () => {
					this.Save();
				});
				this.state.visible = false;
			}
		});
		signals.setProjectData.connect((projectDataJSON: any) => {
			this.hint = 'Select all and copy (CTRL+C)';
			let beautifiedJSONString = JSON.stringify(projectDataJSON, null, '\t');
			// Round numbers to 3 decimals
			beautifiedJSONString = beautifiedJSONString.replace(/(\d*\.\d+)/g, function (match) {
				return Number(match).toFixed(3).toString();
			});
			this.projectData = beautifiedJSONString;
			Log(LOGLEVEL.INFO, 'Received project data successfully');
		});
	}

	selectSave(index: number) {
		this.selectedSaveIndex = index;
	}

	loadSave() {
		if (this.selectedSave) {
			console.log('Loading save: ' + (this.selectedSave as any).projectName);
			window.vext.SendMessage(new RequestLoadProjectMessage((this.selectedSave as any).id));
		}
	}

	NewSave() {
		console.log('New save');
		this.showNewSave = true;
	}

	Save(newSave: boolean = false) {
		const projectHeader = { ...this.currentProjectHeader };
		(projectHeader as any).projectName = this.selectedProjectName;
		if (newSave) {
			(projectHeader as any).projectName = this.newSaveName;
		}
		window.vext.SendMessage(new RequestSaveProjectMessage(JSON.stringify(projectHeader)));
		this.hint = 'Saving...';
		Log(LOGLEVEL.INFO, 'Saving project: ' + (projectHeader as any).projectName);
	}

	Export() {
		this.hint = 'Retrieving save...';
		this.showExportWindow = true;
		window.vext.SendMessage(new RequestProjectDataMessage((this.selectedSave as any).id));
	}

	Delete() {
		window.vext.SendMessage(new RequestDeleteProjectMessage((this.selectedSave as any).id));
	}

	CopyToClipboard() {
		navigator.clipboard.writeText(this.projectData).then(
			function () {
				console.log('Async: Copying to clipboard was successful!');
			},
			function (err) {
				console.error('Async: Could not copy text: ', err);
			}
		);
		this.CloseExportWindow();
	}

	CloseExportWindow() {
		this.hint = '';
		this.showExportWindow = false;
		this.projectData = '';
	}

	onSelectProject(projectName: string) {
		this.selectedProjectName = projectName;
		this.selectedSaveIndex = 0;
	}

	onGetProjects(availableProjects: any) {
		console.log(availableProjects);
		const projects: any = {};
		if (Object.keys(availableProjects).length !== 0) {
			for (const project of availableProjects) {
				if (projects[project.projectName] === undefined) {
					projects[project.projectName] = [];
				}
				projects[project.projectName].push(project);
			}
		}
		// Object.assign(this.projects, projects);
		this.projects = projects;
	}

	FormatTime(unixTimestamp: number, type: string = 'timestamp') {
		if (type === 'since') {
			unixTimestamp = Date.now() - unixTimestamp;
		}
		const date = new Date(unixTimestamp);
		// Hours part from the timestamp
		const hours = date.getHours();
		// Minutes part from the timestamp
		const minutes = '0' + date.getMinutes();
		// Seconds part from the timestamp
		const seconds = '0' + date.getSeconds();

		// Will display time in 10:30:23 format
		const formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

		return date.toDateString() + ' - ' + formattedTime;
	}

	Close() {
		this.state.visible = false;
	}
}
</script>
<style lang="scss" scoped>
/*.Container{
		display: grid;
		min-width: 30vmin;
		min-height: 20vmin;

		.projectDataInput {
			height: 100%;
		}
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

	.current {
		background-color: #404040;
	}*/

.container {
	display: flex;
	flex-flow: column;

	&.new-container,
	&.export-container {
		.alert {
			margin-bottom: 7px;
		}
	}

	.saves-wrapper {
		flex: 1 1 auto;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-gap: 7px;

		.list-wrapper {
			max-height: 200px;
			overflow-y: auto;
			background: #161924;
			padding: 7px;
			border-radius: 6px;
		}

		.save-list,
		.project-list {
			li {
				display: flex;
				font-family: sans-serif;
				flex-direction: row;
				align-content: center;
				align-items: center;
				height: 25px;
				background-color: transparent;
				border-radius: 6px;
				padding: 0 7px;

				&.selected {
					background-color: #313848;
				}

				&.current {
					color: #037fff;
				}
			}
		}
	}

	.save-info {
		background: #161924;
		padding: 7px;
		border-radius: 6px;
		margin-top: 7px;
	}
}
</style>
