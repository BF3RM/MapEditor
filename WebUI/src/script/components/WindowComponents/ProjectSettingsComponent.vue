<template>
	<WindowComponent title="Project Settings">
		<div class="Container" v-if="!showNewSave">
			<ul class="projectList">
				<li v-for="(project, projectName) in projects" v-bind:key="projectName" @click="onSelectProject(project)" :class="selectedProjectName === projectName ? 'selected' : null">{{projectName}}</li>
			</ul>
			<ul v-if="selectedProject" class="saveList">
				<li v-for="(project) in selectedProject" v-bind:key="project.timeStamp" @click="selectSave(project)" :class="selectedSave !== null && selectedSave.timeStamp === project.timeStamp ? 'selected' : null">{{FormatTime(project.timeStamp)}} ago</li>
			</ul>
		</div>
		<div class="Container" v-if="showNewSave">
			<input placeholder="Project Name" v-model="newSaveName"/>
		</div>
		<div class="footer" v-if="!showNewSave">
			<button @click="loadSave()">Load</button>
			<button @click="NewSave()">New Save</button>
		</div>
		<div class="footer" v-if="showNewSave">
			<button @click="Save(true)">Save</button>
			<button @click="showNewSave = false">Abort</button>
		</div>
	</WindowComponent>
</template>
<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';
import { glCustomContainer } from 'vue-golden-layout';
import WindowComponent from './WindowComponent.vue';
import { GetProjectsMessage } from '@/script/messages/GetProjectsMessage';
import { signals } from '@/script/modules/Signals';

@Component({ components: { WindowComponent } })
export default class ProjectSettingsComponent extends WindowComponent {
	private projects = [];
	private selectedProject: any = null;
	private selectedSave: any = null;
	private selectedProjectName = '';
	private showNewSave = false;
	private newSaveName = '';
	constructor() {
		super();
	}

	mounted() {
		signals.setProjectHeaders.connect(this.onGetProjects.bind(this));
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
		let projectName = this.selectedProjectName;
		if (newSave) {
			projectName = this.newSaveName;
		}
		console.log('Saving project as ' + projectName);
	}

	onSelectProject(project:any) {
		console.log(project);
		this.selectedProject = project;
		this.selectedProjectName = project[0].projectName;
		this.$forceUpdate();
	}

	onGetProjects(availableProjects: any) {
		console.log(availableProjects);
		const projects:any = {};
		for (const project of availableProjects) {
			if (projects[project.projectName] === undefined) {
				projects[project.projectName] = [];
			}
			projects[project.projectName].push(project);
		}
		this.projects = projects;

		console.log(this.projects);
	}

	private FormatTime(unixTimestamp: number, type: string = 'timestamp') {
		if (type === 'since') {
			unixTimestamp = Date.now() - unixTimestamp;
		}
		const date = new Date(unixTimestamp);
		const hours = date.getHours() - 1;
		const minutes = '0' + date.getMinutes();
		const seconds = '0' + date.getSeconds();

		return hours + 'h, ' + minutes.substr(-2) + 'm, ' + seconds.substr(-2) + 's';
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
