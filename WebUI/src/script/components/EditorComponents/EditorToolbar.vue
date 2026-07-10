<template>
	<div id="toolbar">
		<info-top-bar>
			<div id="toolbarLeft">
				<!-- Gameface port: element-ui el-menu dropdowns never open in Gameface, so
				     the File/Edit menubar is a plain clickable div dropdown reading the
				     same menuBar tree (populated via signals.menuRegistered). -->
				<div class="fx-menubar">
					<div
						v-for="(item, index) in menuBar.children"
						:key="index"
						class="fx-menu"
						:class="{ open: openMenu === index }"
						@mouseenter="onMenuHover(index)"
					>
						<div class="fx-menu-title" @click.stop="toggleMenu(index)">{{ item.label }}</div>
						<div v-if="openMenu === index && item.children" class="fx-menu-dropdown">
							<template v-for="(subItem, subIndex) in item.children">
								<div
									v-if="subItem.type === 'separator'"
									:key="index + '-' + subIndex"
									class="fx-menu-separator"
								></div>
								<div
									v-else
									:key="index + '-' + subIndex"
									class="fx-menu-entry"
									@click.stop="onMenuEntryClick(subItem)"
								>
									{{ subItem.label }}
								</div>
							</template>
						</div>
					</div>
				</div>
				<!-- Gameface port: element-ui el-radio-group swallows all clicks in Gameface
				     (same as the el-menu dropdowns), so the gizmo tool + world-space
				     selectors are plain clickable divs (the tree / inspector use this
				     working pattern). Same setGizmoMode / setWorldSpace path underneath. -->
				<div id="tools" class="fx-tool-group">
					<div
						v-for="item in tools"
						:key="item"
						class="fx-tool-btn"
						:class="{ active: tool === item }"
						:id="item"
						v-tooltip="getTooltipText(item)"
						@click="onToolClick(item)"
					>
						<img class="tool-icon" :src="iconFor(item)" alt="" />
					</div>
				</div>
				<div id="worldSpace" class="fx-tool-group">
					<div
						v-for="item in worldSpaces"
						:key="item"
						class="fx-tool-btn"
						:class="{ active: worldSpace === item }"
						:id="item"
						v-tooltip="getTooltipText(item)"
						@click="onWorldSpaceClick(item)"
					>
						<img class="tool-icon" :src="iconFor(item)" alt="" />
					</div>
				</div>
			</div>
			<div id="toolbarCenter">
				<key-tip keys="F1" description="Return to the game view" :needsCtrl="false" :needsShift="false" />
			</div>
			<div id="toolbarRight">
				<!-- Gameface port: view-mode selector (Default / Lit / Unlit / Diffuse /
				     Normal / Light / Overdraw ...) was an element-ui el-select, dead in
				     Gameface. Plain-div dropdown; same onViewModeChange -> SetViewModeMessage
				     -> Lua WorldRenderSettings.viewMode path. -->
				<div class="fx-select" :class="{ open: viewMenuOpen }">
					<div class="fx-select-value" @click.stop="toggleViewMenu">
						<span>{{ currentViewLabel }}</span>
						<span class="fx-select-caret">▾</span>
					</div>
					<div v-if="viewMenuOpen" class="fx-select-dropdown">
						<div
							v-for="item in worldViews"
							:key="item.value"
							class="fx-select-option"
							:class="{ active: worldView === item.value }"
							@click.stop="onViewOptionClick(item.value)"
						>
							{{ item.label }}
						</div>
					</div>
				</div>
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

	// Index of the currently open top-level menu (File=0/Edit=1...), or null.
	openMenu: number | null = null;
	// View-mode (worldView) dropdown open state.
	viewMenuOpen = false;

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
		// Close any open menu when clicking elsewhere (the title/entry handlers use
		// @click.stop so they don't trigger this).
		document.addEventListener('click', this.closeMenus);
	}

	beforeDestroy() {
		document.removeEventListener('click', this.closeMenus);
	}

	closeMenus() {
		this.openMenu = null;
		this.viewMenuOpen = false;
	}

	get currentViewLabel(): string {
		const v = this.worldViews.find((w) => w.value === this.worldView);
		return v ? v.label : 'Default';
	}

	toggleViewMenu() {
		this.viewMenuOpen = !this.viewMenuOpen;
		this.openMenu = null;
	}

	onViewOptionClick(value: number) {
		this.viewMenuOpen = false;
		this.worldView = value;
		this.onViewModeChange(value);
	}

	toggleMenu(index: number) {
		this.openMenu = this.openMenu === index ? null : index;
	}

	// Once a menu is open, hovering another top-level entry switches to it (classic
	// menubar behaviour).
	onMenuHover(index: number) {
		if (this.openMenu !== null && this.openMenu !== index) {
			this.openMenu = index;
		}
	}

	onMenuEntryClick(subItem: IMenuEntry) {
		this.openMenu = null;
		if (subItem && subItem.callback) {
			subItem.callback();
		}
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

	// Gameface port: toolbar gizmo icons are <img> (SVG-in-CSS / -webkit-mask do
	// not render in Gameface; only <img> and <img>-loaded PNGs do).
	public iconFor(item: string): string {
		const map: { [k: string]: string } = {
			select: 'cursor-default-outline',
			translate: 'cursor-move',
			rotate: 'rotate-3d',
			scale: 'arrow-expand',
			local: 'cube-outline',
			world: 'earth'
		};
		const name = map[item];
		if (!name) {
			return '';
		}
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		return require(`@/icons/editor/${name}.png`);
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

	// Gameface port: element-ui's el-radio-group @change does NOT fire in Gameface
	// (same reason the el-menu dropdowns don't open), so wire the native click on
	// each button directly to the same setGizmoMode / setWorldSpace path.
	onToolClick(item: string) {
		this.tool = item as GIZMO_MODE;
		this.onToolChange(item);
	}

	onWorldSpaceClick(item: string) {
		this.worldSpace = item as WORLD_SPACE;
		this.onWorldSpaceChange(item);
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
	/* Gameface has no -webkit-mask support; use background-image with light-filled
	   SVGs instead (SVG via CSS background/img works in Gameface, mask does not). */
	background-repeat: no-repeat !important;
	background-position: center !important;
	background-size: 19px !important;
}

/* Gameface port: gizmo tool + world-space selectors are plain clickable divs
   (element-ui el-radio-group swallows clicks in Gameface). Blue = active tool,
   matching the original el-radio-button checked style (#037fff). */
.fx-tool-group {
	display: flex;
	background-color: #1f2633;
	border-radius: 6px;
	overflow: hidden;
}
.fx-tool-btn {
	height: 28px;
	width: 45px;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #1f2633;
	border: 1px solid #05070b;
	cursor: pointer;
}
.fx-tool-btn.active {
	background-color: #037fff !important;
	border-color: #037fff !important;
}
.tool-icon {
	width: 19px;
	height: 19px;
	pointer-events: none;
}

/* Gameface port: plain-div File/Edit menubar (element-ui el-menu never opens in
   Gameface). Styling mirrors the original dark toolbar buttons. */
.fx-menubar {
	display: flex;
	flex-direction: row;
	align-items: center;
}
.fx-menu {
	position: relative;
}
.fx-menu-title {
	height: 28px;
	line-height: 28px;
	padding: 0 12px;
	margin-right: 7px;
	background-color: #1f2633;
	color: #fff;
	border-radius: 6px;
	font-size: 13px;
	cursor: pointer;
	user-select: none;
}
.fx-menu.open .fx-menu-title,
.fx-menu-title:hover {
	background-color: #037fff;
}
.fx-menu-dropdown {
	position: absolute;
	top: 30px;
	left: 0;
	min-width: 170px;
	background-color: #1f2633;
	border: 1px solid #05070b;
	border-radius: 4px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
	padding: 4px 0;
	z-index: 1000;
}
.fx-menu-entry {
	height: 26px;
	line-height: 26px;
	padding: 0 14px;
	color: #dfe4ea;
	font-size: 13px;
	white-space: nowrap;
	cursor: pointer;
	user-select: none;
}
.fx-menu-entry:hover {
	background-color: #037fff;
	color: #fff;
}
.fx-menu-separator {
	height: 1px;
	margin: 4px 6px;
	background-color: #05070b;
}

/* Gameface port: view-mode selector (was element-ui el-select). */
.fx-select {
	position: relative;
}
.fx-select-value {
	height: 28px;
	line-height: 28px;
	padding: 0 10px;
	background-color: #1f2633;
	border: 1px solid #05070b;
	border-radius: 6px;
	color: #dfe4ea;
	font-size: 13px;
	cursor: pointer;
	user-select: none;
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.fx-select-caret {
	margin-left: 8px;
	font-size: 10px;
	opacity: 0.7;
}
.fx-select-dropdown {
	position: absolute;
	top: 30px;
	left: 0;
	right: 0;
	max-height: 70vh;
	overflow-y: auto;
	background-color: #1f2633;
	border: 1px solid #05070b;
	border-radius: 4px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
	padding: 4px 0;
	z-index: 1000;
}
.fx-select-option {
	height: 26px;
	line-height: 26px;
	padding: 0 12px;
	color: #dfe4ea;
	font-size: 13px;
	white-space: nowrap;
	cursor: pointer;
	user-select: none;
}
.fx-select-option:hover {
	background-color: #037fff;
	color: #fff;
}
.fx-select-option.active {
	color: #409eff;
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

	.fx-select {
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
