<template>
	<WindowComponent :state="state" :title="title" :isDestructible="true">
		<div class="Container" v-if="!showNewSave">
			<ul class="projectList">
				<li v-if="projects.length === 0">No saved projects</li>
				<li v-else v-for="(project, projectName) in projects" v-bind:key="projectName" @click="onSelectProject(project)" :class="selectedProjectName === projectName ? 'selected' : null">{{projectName}}</li>
			</ul>
			<ul v-if="selectedProject" class="saveList">
				<li v-for="(project) in selectedProject" v-bind:key="project.timeStamp" @click="selectSave(project)" :class="selectedSave !== null && selectedSave.timeStamp === project.timeStamp ? 'selected' : null">{{FormatTime(project.timeStamp)}}</li>
			</ul>
		</div>
		<div class="Container" v-if="showNewSave">
			<input placeholder="Project Name" v-model="newSaveName"/>
		</div>
		<div class="footer" v-if="!showNewSave">
			<button :disabled="projects.length === 0 || selectedProject === null || selectedSave == null" @click="loadSave()">Load</button>
			<button @click="NewSave()">New Save</button>
		</div>
		<div class="footer" v-if="showNewSave">
			<button @click="Save(true)">Save</button>
			<button @click="showNewSave = false">Abort</button>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import WindowComponent from './WindowComponent.vue';
import { GetProjectsMessage } from '@/script/messages/GetProjectsMessage';
import { signals } from '@/script/modules/Signals';

@Component({ components: { WindowComponent } })
export default class ProjectSettingsComponent extends Vue {
	private title = 'Project Settings';
	private projects = [];
	private selectedProject: any = null;
	private selectedSave: any = null;
	private selectedProjectName = '';
	private showNewSave = false;
	private state = {
		visible: false
	};

	get newSaveName() {
		return (this.currentProjectHeader as any).projectName;
	}

	set newSaveName(value: string) {
		(this.currentProjectHeader as any).projectName = value;
	}

	private currentProjectHeader = {
		projectName: 'Untitled Project'
	};

	NotImplemented() {
		console.error('Not implemented');
	}

	mounted() {
		signals.setProjectHeaders.connect(this.onGetProjects.bind(this));
		signals.menuRegistered.emit(['File', 'New Project'], () => {
			this.showNewSave = true;
			this.title = 'New Project';
			this.state.visible = true;
		});
		signals.menuRegistered.emit(['File', 'Load Project'], () => {
			window.vext.SendMessage(new GetProjectsMessage());
			this.showNewSave = false;
			this.title = 'Load Project';
			this.state.visible = true;
		});
		signals.setCurrentProjectHeader.connect((projectHeader) => {
			this.currentProjectHeader = projectHeader;
		});
	}

	selectSave(project: any) {
		this.selectedSave = project;
	}

	loadSave() {
		console.log('Loading save: ' + this.selectedSave.projectName);
		(window as any).WebUI.Call('DispatchEventLocal', 'MapEditor:RequestProjectLoad', this.selectedSave.id);
	}

	NewSave() {
		console.log('New save');
		this.showNewSave = true;
	}

	Save(newSave: boolean = false) {
		const projectHeader = Object.assign({}, this.currentProjectHeader);
		(projectHeader as any).projectName = this.selectedProjectName;
		if (newSave) {
			(projectHeader as any).projectName = this.newSaveName;
		}
		console.log('Saving project as ' + (projectHeader as any).projectName);
		(window as any).WebUI.Call('DispatchEventLocal', 'MapEditor:RequestProjectSave', JSON.stringify(projectHeader));
	}

	onSelectProject(project:any) {
		console.log(project);
		this.selectedProject = project;
		this.selectedProjectName = project[0].projectName;
		this.$forceUpdate();
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
			this.projects = projects;
		}

		console.log(this.projects);
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
		var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

		return date.toDateString() + ' - ' + formattedTime;
	}
}
</script>
<style lang="scss" scoped>
	.Container{
		display: grid;
	}
	.projectList {
		grid-column: 1;
		padding: 5px;

	}
	.saveList {
		grid-column: 2;
		padding: 5px;
	}

	.selected {
		background-color: #111;
	}
</style>
