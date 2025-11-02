<template>
	<WindowComponent :visible="state.visible" :title="title" :isDestructible="true" @update:visible="Close">
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
import { defineComponent } from '@vue/composition-api';
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

export default defineComponent({
	name: 'ProjectSettingsComponent',
	components: {
		WindowComponent
	},
	data() {
		return {
			title: 'Project Settings',
			projects: {} as Record<string, any[]>,
			selectedProjectName: '',
			selectedSaveIndex: 0,
			showNewSave: false,
			showExportWindow: false,
			projectData: '',
			hint: '',
			state: {
				visible: false
			},
			currentProjectHeader: {
				projectName: '',
				timeStamp: 0
			}
		};
	},
	computed: {
		projectsArray(): any[] {
			return Object.values(this.projects);
		},
		selectedProject(): any[] | null {
			return this.projects[this.selectedProjectName] || null;
		},
		selectedSave(): any | null {
			const project = this.selectedProject;
			if (project) {
				return project[this.selectedSaveIndex] || null;
			}
			return null;
		},
		buttonsDisabled(): boolean {
			return this.projectsArray.length === 0 || this.selectedProject === null || this.selectedSave == null;
		},
		newSaveName: {
			get(): string {
				return this.currentProjectHeader.projectName;
			},
			set(value: string) {
				this.currentProjectHeader.projectName = value;
			}
		}
	},
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
			beautifiedJSONString = beautifiedJSONString.replace(/("[xyz]":\s*)([-]?\d+\.\d+)/g, (str, prefix, n) => {
				return prefix + Number(n).toFixed(3).toString();
			});
			this.projectData = beautifiedJSONString;
			Log(LOGLEVEL.INFO, 'Received project data successfully');
		});
	},
	methods: {
		selectSave(index: number) {
			this.selectedSaveIndex = index;
		},
		loadSave() {
			if (this.selectedSave) {
				console.log('Loading save: ' + this.selectedSave.projectName);
				window.vext.SendMessage(new RequestLoadProjectMessage(this.selectedSave.id));
			}
		},
		NewSave() {
			console.log('New save');
			this.showNewSave = true;
		},
		Save(newSave: boolean = false) {
			const projectHeader = { ...this.currentProjectHeader };
			projectHeader.projectName = this.selectedProjectName;
			if (newSave) {
				projectHeader.projectName = this.newSaveName;
			}
			window.vext.SendMessage(new RequestSaveProjectMessage(JSON.stringify(projectHeader)));
			this.hint = 'Saving...';
			Log(LOGLEVEL.INFO, 'Saving project: ' + projectHeader.projectName);
		},
		Export() {
			this.hint = 'Retrieving save...';
			this.showExportWindow = true;
			window.vext.SendMessage(new RequestProjectDataMessage(this.selectedSave.id));
		},
		Delete() {
			window.vext.SendMessage(new RequestDeleteProjectMessage(this.selectedSave.id));
		},
		CloseExportWindow() {
			this.hint = '';
			this.showExportWindow = false;
			this.projectData = '';
		},
		onSelectProject(projectName: string) {
			this.selectedProjectName = projectName;
			this.selectedSaveIndex = 0;
		},
		onGetProjects(availableProjects: any) {
			console.log(availableProjects);
			const projectsObj: any = {};
			if (Object.keys(availableProjects).length !== 0) {
				for (const project of availableProjects) {
					if (projectsObj[project.projectName] === undefined) {
						projectsObj[project.projectName] = [];
					}
					projectsObj[project.projectName].push(project);
				}
			}
			this.projects = projectsObj;
		},
		FormatTime(unixTimestamp: number, type: string = 'timestamp') {
			if (type === 'since') {
				unixTimestamp = Date.now() - unixTimestamp;
			}
			const date = new Date(unixTimestamp);
			const hours = date.getHours();
			const minutes = '0' + date.getMinutes();
			const seconds = '0' + date.getSeconds();
			const formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
			return date.toDateString() + ' - ' + formattedTime;
		},
		Close() {
			this.state.visible = false;
		}
	}
});
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
