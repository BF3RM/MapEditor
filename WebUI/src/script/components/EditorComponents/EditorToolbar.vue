<template>
	<div id="toolbar">
		<info-top-bar>
			<div id="toolbarLeft">
				<el-menu mode="horizontal" menu-trigger="hover" :unique-opened="true" size="mini" v-for="(item, index) in menuBar.children" :key="index" class="el-menu" @select="onSelectMenu">
<!--					<recursive-menubar v-if="item.children.length > 1" :value="item" :index="index"/>-->
					<el-submenu v-if="item.children" :index="item.label" :show-timeout="10" :hide-timeout="100">
						<template slot="title">{{item.label}}</template>
						<template v-if="item.children.length > 0">
							<el-menu-item v-for="(subItem, subIndex) in item.children" :key="index + '-' + subIndex" :index="index + '-' + subIndex" :class="subItem.type">
								<recursive-menubar v-if="subItem.children && subItem.children.length > 0" :value="subItem"/>
								<span v-else>
									{{subItem.label}}
								</span>
							</el-menu-item>
						</template>
					</el-submenu>
					<el-menu-item v-else :class="item.type" :index="index">
						{{item.label}}
					</el-menu-item>
				</el-menu>
				<el-radio-group v-model="tool" size="mini" id="tools" @change="onToolChange">
					<el-radio-button v-for="item in tools" :key="item" :label="item" :id="item"/>
				</el-radio-group>
				<el-radio-group v-model="worldSpace" size="mini" id="worldSpace" @change="onWorldSpaceChange">
					<el-radio-button v-for="item in worldSpaces" :key="item" :label="item" :id="item"/>
				</el-radio-group>
			</div>
			<div id="toolbarCenter">
				<key-tip
					:keys="'F1'"
					:description="'Enable play mode'"/>
			</div>
			<div id="toolbarRight">
				<el-select name="WorldView" id="worldView" :default-first-option=true v-model="worldView" size="mini" @change="onViewModeChange">
					<el-option v-for="item in worldViews" :key="item.value" :label="item.label" :value="item.value"/>
				</el-select>
			</div>
		</info-top-bar>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, PropSync } from 'vue-property-decorator';
import { signals } from '@/script/modules/Signals';
import IMenuEntry from '@/script/interfaces/IMenuEntry';
import RecursiveMenubar from '@/script/components/widgets/RecursiveMenubar.vue';
import { SetViewModeMessage } from '@/script/messages/SetViewModeMessage';
import { GIZMO_MODE, WORLD_SPACE } from '@/script/types/Enums';
import InfoTopBar from '@/script/components/InfoTopBar.vue';
import KeyTip from '@/script/components/KeyTip.vue';

@Component({ components: { InfoTopBar, RecursiveMenubar, KeyTip } })
export default class EditorToolbar extends Vue {
	private worldView = 0;
	private tool = (window).editor.threeManager.gizmoMode;
	private worldSpace = (window).editor.threeManager.worldSpace;
	private worldSpaces = ['local', 'world'];
	private tools = ['select', 'translate', 'rotate', 'scale'];

	private windows = [];
	private menuBar: IMenuEntry = {
		type: 'menu',
		entries: new Map<string, IMenuEntry>(),
		children: [],
		callback: undefined
	};

	private worldViews = [
		{
			value: 0,
			label: 'Default'
		},
		{
			value: 1,
			label: 'Raw Linear'
		},
		{
			value: 2,
			label: 'Raw Linear Alpha'
		},
		{
			value: 3,
			label: 'Diffuse'
		},
		{
			value: 4,
			label: 'Specular'
		},
		{
			value: 5,
			label: 'Emissive'
		},
		{
			value: 6,
			label: 'Normal'
		},
		{
			value: 7,
			label: 'Smoothness'
		},
		{
			value: 8,
			label: 'Material'
		},
		{
			value: 9,
			label: 'Light'
		},
		{
			value: 10,
			label: 'Light Diffuse'
		},
		{
			value: 11,
			label: 'Light Specular'
		},
		{
			value: 12,
			label: 'Light Indirect'
		},
		{
			value: 13,
			label: 'Light Translucency'
		},
		{
			value: 14,
			label: 'Light Overdraw'
		},
		{
			value: 15,
			label: 'Sky Visibility'
		},
		{
			value: 16,
			label: 'Sky Visibility Raw'
		},
		{
			value: 17,
			label: 'Overdraw'
		},
		{
			value: 18,
			label: 'Dynamic AO'
		},
		{
			value: 19,
			label: 'Occluders'
		},
		{
			value: 20,
			label: 'Radiosity Light Maps'
		},
		{
			value: 21,
			label: 'Radiosity Diffuse Color'
		},
		{
			value: 22,
			label: 'Radiosity Target UV'
		},
		{
			value: 23,
			label: 'Velocity Vector'
		},
		{
			value: 24,
			label: 'Distortion Vector'
		}
	];

	private mounted() {
		signals.gizmoModeChanged.connect(this.onGizmoModeUpdated.bind(this));
		signals.worldSpaceChanged.connect(this.onWorldSpaceUpdated.bind(this));
		signals.menuRegistered.connect(this.onMenuRegistered.bind(this));
	}

	private onSelectMenu(key: string, keyPath: string[]) {
		if (keyPath[1] === undefined) {
			return;
		}
		const paths = keyPath[keyPath.length - 1].split('-');
		let lastPath = this.menuBar;
		for (const k of paths) {
			if (lastPath.children[Number(k)] !== undefined) {
				lastPath = lastPath.children[Number(k)];
			}
		}
		if (lastPath !== undefined && lastPath.callback !== undefined) {
			lastPath.callback();
		}
	}

	onViewModeChange(newView: number) {
		window.editor.vext.SendMessage(new SetViewModeMessage(newView));
	}

	private onMenuRegistered(path: string[], entryCallback?: any) {
		let lastEntry = this.menuBar;

		for (let i = 0; i < path.length; i++) {
			const currentEntry = path[i];
			if (currentEntry === '') {
				lastEntry.children.push({
					type: 'separator',
					label: ''
				} as IMenuEntry);
				break;
			}
			if (lastEntry.entries!.get(currentEntry) === undefined) {
				lastEntry.entries!.set(currentEntry, ({
					type: 'entry',
					label: currentEntry,
					entries: new Map<string, IMenuEntry>(),
					children: [],
					callback: entryCallback
				} as IMenuEntry));
				if (i === 0) {
					this.menuBar.children.push(lastEntry!.entries!.get(currentEntry) as IMenuEntry);
				} else {
					lastEntry.children.push(lastEntry!.entries!.get(currentEntry) as IMenuEntry);
				}
			}
			if (i !== path.length - 1 && lastEntry!.entries!.get(currentEntry)!.children === null) {
				lastEntry!.entries!.get(currentEntry)!.children = [];
				lastEntry!.entries!.get(currentEntry)!.children.push(lastEntry!.entries!.get(currentEntry) as IMenuEntry);
			}
			lastEntry = lastEntry!.entries!.get(currentEntry) as IMenuEntry;
		}
	}

	private onWorldSpaceUpdated(mode: WORLD_SPACE) {
		console.log('world space changed');
		this.worldSpace = mode;
	}

	private onGizmoModeUpdated(mode: GIZMO_MODE) {
		this.tool = mode;
	}

	private onWorldSpaceChange(mode: string) {
		if (this.worldSpaces.indexOf(mode) !== -1) {
			(window).editor.threeManager.setWorldSpace(mode.toLowerCase() as WORLD_SPACE);
		} else {
			console.error('Attempted to select a world space that does not exist: ' + mode);
		}
	}

	private onToolChange(newTool: string) {
		if (this.tools.indexOf(newTool) !== -1) {
			(window).editor.threeManager.setGizmoMode(newTool.toLowerCase() as GIZMO_MODE);
		} else {
			console.error('Attempted to select a tool that does not exist: ' + newTool);
		}
	}
}
</script>
<style lang="scss">
#tools label+label, #worldSpace label+label {
	border-left: 1px solid #151515;
}
#tools input+span, #worldSpace input+span {
	font-size: 0!important;
	height: 30px;
	width: 30px;
}
#tools input[value="select"]+span {
	-webkit-mask: url(../../../icons/editor/cursor-default-outline.svg) no-repeat center;
}
#tools input[value="translate"]+span {
	-webkit-mask: url(../../../icons/editor/cursor-move.svg) no-repeat center;
}
#tools input[value="rotate"]+span {
	-webkit-mask: url(../../../icons/editor/rotate-3d.svg) no-repeat center;
}
#tools input[value="scale"]+span {
	-webkit-mask: url(../../../icons/editor/arrow-expand.svg) no-repeat center;
}

#worldSpace input[value="local"]+span {
	-webkit-mask: url(../../../icons/editor/cube-outline.svg) no-repeat center;
}
#worldSpace input[value="world"]+span {
	-webkit-mask: url(../../../icons/editor/earth.svg) no-repeat center;
}
li.el-menu-item.separator {
	border-bottom: 1px solid #999;
	height: 1px!important;
}
.el-menu-item, .el-submenu__title {
	height: 30px!important;
	line-height: 30px!important;
	color: #fff!important;
}
.el-submenu__icon-arrow {
	right: 5px !important;
	-webkit-transition: -webkit-transform .1s;
	transition: -webkit-transform .1s;
	transition: transform .1s;
	transition: transform .1s, -webkit-transform .1s;
	transition: transform .1s,-webkit-transform .1s;
	font-size: 12px;
}
.el-menu {
	border-right: solid 1px #e6e6e6;
	list-style: none;
	position: relative;
	margin: 0;
	padding-left: 0;
	background-color: #2e2e2e!important;
}

.is-opened .el-submenu__title, .is-opened .el-submenu-item, .el-submenu__title:hover, .el-menu-item:hover{
	background-color: #444!important;
}
.el-menu--horizontal>.el-menu-item.is-active {
	border-bottom: 0!important;
}
.el-menu.el-menu--horizontal {
	border-bottom: 0!important;
}
.el-menu.el-menu--horizontal {
	background: #2e2e2e;
	border-radius: 5px;
	overflow: hidden;
}
.el-menu--horizontal .el-menu .el-menu-item, .el-menu--horizontal .el-menu .el-submenu__title {
	background-color: #2e2e2e;
	float: none;
	height: 36px;
	line-height: 36px;
	padding: 0 10px;
	color: #fff;
}
.el-menu-item, .el-submenu__title {
	background-color: #2e2e2e!important;
}
.el-menu.el-menu--horizontal {
	background: #2e2e2e;
	border-radius: 5px;
}
.el-menu--horizontal>.el-menu-item {
	height: 30px;
	line-height: 30px;
}
.el-menu-item {
	font-size: 14px;
	color: #fff;
	padding: 0 5px!important;
	cursor: pointer;
	-webkit-transition: border-color .1s,background-color .1s,color .1s;
	transition: border-color .1s,background-color .1s,color .1s;
	box-sizing: border-box;
}
.el-select-dropdown {
	border: 1px solid #4a4a4a;
	border-radius: 5px;
	background-color: #262626;
}
.el-select-dropdown__item.selected {
	color: #ffffff;
	font-weight: 700;
}
.el-select-dropdown__item.hover, .el-select-dropdown__item:hover {
	background-color: #444;
}
input#worldView {
	border: 0;
	background-color: #3e3e3e !important;
	color: #fff;
}
.el-select-dropdown {
	border: 1px solid #4a4a4a!important;
	border-radius: 5px!important;
	background-color: #262626!important;
}
.el-select-dropdown__item.hover, .el-select-dropdown__item:hover {
	background-color: #444!important;
}
.el-select-dropdown__item.selected {
	color: #fff!important;
	font-weight: 700!important;
}
.el-select-dropdown__item {
	color: #fff!important;
}
</style>
<style lang="scss" scoped>
#toolbar {
	user-select: none;
	z-index: 1;
	left: 0;
	top: 0;
	width: 100vw;
	background-color: #1d1d1d;
	display: flex;
	justify-content: space-between;
	border-bottom: 2px solid black;
	position: relative;
}
.el-radio-group {
	background-color: #2e2e2e;
	border-radius: 5px;
}
div#worldSpace {
	margin-left: 10px;
}
div#tools {
	margin-left: 10px;
}
#toolbarLeft, #toolbarCenter, #toolbarRight {
	display: flex;
}
#toolbarLeft #tools, #toolbarLeft #worldSpace {
	display: flex;
}
button#playButton {
	margin: auto;
}

li.ui-widget-seperator {
	font-size: 0;
	height: 0;
	border-bottom: 1px solid #afafaf;
	margin: 5px;
}
label i {
	padding: 12px;
	background: #b9b9b9;
	-webkit-mask-position-y: 12px;
}
#toolbar input[type=radio] {
	border: 0;
	clip: rect(0 0 0 0);
	height: 1px;
	margin: -1px;
	overflow: hidden;
	padding: 0;
	position: absolute;
	width: 1px;
}
#toolbar input[type="radio"]:checked+label {
	border-top: 2px solid #fff;
	background-color: #b9b9b9;
}
#toolbar input[type="radio"]:checked+label i{
	background-color: #111;
}

label.is-active {
	background: #444;
	border-radius: 5px;
}

#toolbarRight {
	margin-left: auto;
	margin-right: 5vmin;
}
</style>
