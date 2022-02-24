<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true">
		<div v-if="showNewSave">
			<div class="Container">
				<input placeholder="Project Name" v-model="newSaveName"/>
			</div>
			<div class="footer">
				<div>
					<button @click="Save(true)">Save</button>
					<button @click="showNewSave = false">Abort</button>
				</div>
				<div>
					<span>{{hint}}</span>
				</div>
			</div>
		</div>
		<div v-else-if="showExportWindow">
			<div class="Container">
				<textarea class="projectDataInput" readonly placeholder="Loading..."
					@focus="$event.target.select()" v-model="projectData"
				/>
			</div>
			<div class="footer">
				<div>
					<div>
<!--						<button @click="CopyToClipboard">Copy</button> Not supported in VU yet-->
						<button @click="CloseExportWindow">Close</button>
					</div>
					<span>{{hint}}</span>
				</div>
			</div>
		</div>
		<div v-else>
			<div class="Container">
				<ul class="projectList">
					<li v-if="projects.length === 0">No saved projects</li>
					<li v-else
						v-for="(project, projectName) in projects"
						v-bind:key="projectName"
						@click="onSelectProject(projectName)"
						:class="{ selected: selectedProjectName === projectName, current: currentProjectHeader.projectName === projectName }">
						{{projectName}}
					</li>
				</ul>
				<ul v-if="selectedProject" class="saveList">
					<li v-for="(save, index) in selectedProject"
						v-bind:key="save.timeStamp"
						@click="selectSave(index)"
						:class="{ selected: selectedSave && selectedSave.timeStamp === save.timeStamp,
							current: save.timeStamp === currentProjectHeader.timeStamp }">
						{{FormatTime(save.timeStamp)}}</li>
				</ul>
			</div>
			<div class="footer">
				<div class="saveInfo" v-if="selectedSave">
					<span>Selected save info:</span>
					Map name: {{selectedSave.mapName}}
					<span v-if="selectedSave">Gamemode: {{selectedSave.gameModeName}}</span>
					<!--<span v-if="selectedSave">Bundles: {{selectedSave.requiredBundles}}</span>-->
				</div>
				<div>
					<button :disabled="buttonsDisabled" @click="loadSave()">Load</button>
					<button @click="NewSave()">New Save</button>
					<button :disabled="buttonsDisabled" @click="Export">Export</button>
					<button :disabled="buttonsDisabled" @click="Delete">Delete</button>
				</div>
			</div>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WindowComponent from './WindowComponent.vue';
import { GetProjectsMessage, RequestSaveProjectMessage, RequestDeleteProjectMessage, RequestLoadProjectMessage, RequestProjectDataMessage } from '@/script/messages/MessagesIndex';
import { signals } from '@/script/modules/Signals';
import { Log } from '@/script/modules/Logger';
import { LOGLEVEL } from '@/script/types/Enums';

	@Component({ components: { WindowComponent } })
export default class ProjectSettingsComponent extends Vue {
	private title = 'Project Settings';
	private projects = {};
	private selectedProjectName: string = '';
	private selectedSaveIndex: number = 0;
	private showNewSave = false;
	private showExportWindow = false;
	private projectData = '';

	private hint = '';
	private state = {
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

	private currentProjectHeader = {
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
			// Parse and stringify again to beautify
			const projectData = JSON.parse(projectDataJSON);
			const beautifiedJSON = JSON.stringify(projectData, null, '\t');
			this.projectData = beautifiedJSON;
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
		navigator.clipboard.writeText(this.projectData).then(function() {
			console.log('Async: Copying to clipboard was successful!');
		}, function(err) {
			console.error('Async: Could not copy text: ', err);
		});
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

	private FormatTime(unixTimestamp: number, type: string = 'timestamp') {
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
}
</script>
<style lang="scss" scoped>
	.Container{
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
		color: #409EFF;
	}

	.current {
		background-color: #404040;
	}
</style>
