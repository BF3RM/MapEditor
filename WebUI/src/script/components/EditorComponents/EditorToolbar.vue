<template>
	<div id="toolbar">
		<info-top-bar>
			<div id="toolbarLeft">
				<el-menu
					mode="horizontal"
					menu-trigger="hover"
					:unique-opened="true"
					size="mini"
					v-for="(item, index) in menuBar.children"
					:key="index"
					class="el-menu"
					@select="onSelectMenu"
				>
					<!--					<recursive-menubar v-if="item.children.length > 1" :value="item" :index="index"/>-->
					<el-submenu v-if="item.children" :index="item.label" :show-timeout="10" :hide-timeout="100">
						<template slot="title">{{ item.label }}</template>
						<template v-if="item.children.length > 0">
							<el-menu-item
								v-for="(subItem, subIndex) in item.children"
								:key="index + '-' + subIndex"
								:index="index + '-' + subIndex"
								:class="subItem.type"
							>
								<recursive-menubar
									v-if="subItem.children && subItem.children.length > 0"
									:value="subItem"
								/>
								<span v-else>
									{{ subItem.label }}
								</span>
							</el-menu-item>
						</template>
					</el-submenu>
					<el-menu-item v-else :class="item.type" :index="index">
						{{ item.label }}
					</el-menu-item>
				</el-menu>
				<el-radio-group v-model="tool" size="mini" id="tools" @change="onToolChange">
					<el-radio-button
						v-for="item in tools"
						:key="item"
						:label="item"
						:id="item"
						v-tooltip="getTooltipText(item)"
					/>
				</el-radio-group>
				<el-radio-group v-model="worldSpace" size="mini" id="worldSpace" @change="onWorldSpaceChange">
					<el-radio-button
						v-for="item in worldSpaces"
						:key="item"
						:label="item"
						:id="item"
						v-tooltip="getTooltipText(item)"
					/>
				</el-radio-group>
			</div>
			<div id="toolbarCenter">
				<key-tip keys="F1" description="Return to the game view" :needsCtrl="false" :needsShift="false" />
			</div>
			<div id="toolbarRight">
				<el-select
					name="WorldView"
					id="worldView"
					:default-first-option="true"
					v-model="worldView"
					size="mini"
					@change="onViewModeChange"
				>
					<el-option v-for="item in worldViews" :key="item.value" :label="item.label" :value="item.value" />
				</el-select>
			</div>
		</info-top-bar>
	</div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { signals } from '@/script/modules/Signals';
import IMenuEntry from '@/script/interfaces/IMenuEntry';
import RecursiveMenubar from '@/script/components/widgets/RecursiveMenubar.vue';
import { SetViewModeMessage } from '@/script/messages/SetViewModeMessage';
import { GIZMO_MODE, WORLD_SPACE } from '@/script/types/Enums';
import InfoTopBar from '@/script/components/InfoTopBar.vue';
import KeyTip from '@/script/components/KeyTip.vue';

@Component({ components: { InfoTopBar, RecursiveMenubar, KeyTip } })
export default class EditorToolbar extends Vue {
	worldView = 0;
	tool = window.editor.threeManager.gizmoMode;
	worldSpace = window.editor.threeManager.worldSpace;
	worldSpaces = ['world', 'local'];
	tools = ['select', 'translate', 'rotate', 'scale'];

	windows = [];
	menuBar: IMenuEntry = {
		type: 'menu',
		entries: new Map<string, IMenuEntry>(),
		children: [],
		callback: undefined
	};

	worldViews = [
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

	mounted() {
		signals.gizmoModeChanged.connect(this.onGizmoModeUpdated.bind(this));
		signals.worldSpaceChanged.connect(this.onWorldSpaceUpdated.bind(this));
		signals.menuRegistered.connect(this.onMenuRegistered.bind(this));
	}

	onSelectMenu(key: string, keyPath: string[]) {
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
		window.vext.SendMessage(new SetViewModeMessage(newView));
	}

	getTooltipText(text: string) {
		switch (text) {
			case 'select':
				return 'Select';
			case 'translate':
				return 'Move';
			case 'rotate':
				return 'Rotate';
			case 'scale':
				return 'Scale';
			case 'world':
				return 'World space';
			case 'local':
				return 'Local space';
			default:
				return '';
		}
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
				lastEntry.entries!.set(currentEntry, {
					type: 'entry',
					label: currentEntry,
					entries: new Map<string, IMenuEntry>(),
					children: [],
					callback: entryCallback
				} as IMenuEntry);
				if (i === 0) {
					this.menuBar.children.push(lastEntry.entries!.get(currentEntry) as IMenuEntry);
				} else {
					lastEntry.children.push(lastEntry.entries!.get(currentEntry) as IMenuEntry);
				}
			}
			if (i !== path.length - 1 && lastEntry.entries!.get(currentEntry)!.children === null) {
				lastEntry.entries!.get(currentEntry)!.children = [];
				lastEntry.entries!.get(currentEntry)!.children.push(lastEntry.entries!.get(currentEntry) as IMenuEntry);
			}
			lastEntry = lastEntry.entries!.get(currentEntry) as IMenuEntry;
		}
	}

	private onWorldSpaceUpdated(mode: WORLD_SPACE) {
		console.log('world space changed');
		this.worldSpace = mode;
	}

	private onGizmoModeUpdated(mode: GIZMO_MODE) {
		this.tool = mode;
	}

	onWorldSpaceChange(mode: string) {
		if (this.worldSpaces.indexOf(mode) !== -1) {
			window.editor.threeManager.setWorldSpace(mode.toLowerCase() as WORLD_SPACE);
		} else {
			console.error('Attempted to select a world space that does not exist: ' + mode);
		}
	}

	onToolChange(newTool: string) {
		if (this.tools.indexOf(newTool) !== -1) {
			window.editor.threeManager.setGizmoMode(newTool.toLowerCase() as GIZMO_MODE);
		} else {
			console.error('Attempted to select a tool that does not exist: ' + newTool);
		}
	}
}
</script>
<style lang="scss">
#tools input + span,
#worldSpace input + span {
	font-size: 0 !important;
	height: 28px;
	width: 45px;
	padding: 0;
	-webkit-mask-size: 19px !important;
}

.el-radio-button__orig-radio:checked + .el-radio-button__inner {
	background-color: #037fff !important;
	border-color: #037fff !important;
	box-shadow: -1px 0 0 0 #037fff;
}

#tools input[value='select'] + span {
	-webkit-mask: url(../../../icons/editor/cursor-default-outline.svg) no-repeat center;
}

#tools input[value='translate'] + span {
	-webkit-mask: url(../../../icons/editor/cursor-move.svg) no-repeat center;
}

#tools input[value='rotate'] + span {
	-webkit-mask: url(../../../icons/editor/rotate-3d.svg) no-repeat center;
}

#tools input[value='scale'] + span {
	-webkit-mask: url(../../../icons/editor/arrow-expand.svg) no-repeat center;
}

#worldSpace input[value='local'] + span {
	-webkit-mask: url(../../../icons/editor/cube-outline.svg) no-repeat center;
}

#worldSpace input[value='world'] + span {
	-webkit-mask: url(../../../icons/editor/earth.svg) no-repeat center;
}

.el-menu {
	margin-right: 7px !important;
}

.el-menu-item,
.el-submenu__title {
	height: 28px !important;
	line-height: 28px !important;
	background-color: #1f2633 !important;
	color: #fff !important;
	border-radius: 6px !important;
}

.el-menu.el-menu--horizontal {
	background: #2e2e2e;
	border-radius: 6px;
}
</style>
<style lang="scss" scoped>
.el-radio-group {
	background-color: #1f2633;
	border-radius: 6px;
}

div#worldSpace,
div#tools {
	margin-left: 10px;
}

div#tools:first-of-type {
	margin-left: 0;
}

#toolbarLeft,
#toolbarCenter,
#toolbarRight,
#toolbarLeft #tools,
#toolbarLeft #worldSpace {
	display: flex;
}

#toolbarRight {
	margin-left: auto;
	margin-right: 0.5em;

	button {
		padding: 0 6px;
		box-sizing: border-box;

		img {
			height: 22px;
		}
	}

	.el-select {
		width: 25vh;
	}
}

#toolbarCenter {
	display: flex;
	margin: 0 14px;
	flex: 1 1 auto;
	justify-content: flex-start;
}

.key-tip {
	font-size: 12px;
	font-weight: 500;

	::v-deep .key-outline {
		font-size: 13px;
		margin-right: 10px !important;
		height: 25px;
	}
}
</style>
