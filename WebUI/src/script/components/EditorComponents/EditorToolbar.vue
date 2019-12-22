<template>
	<div id="toolbar">
		<div id="toolbarLeft">
			<ul id="menubar">
			</ul>
			<el-radio-group v-model="tool" size="mini" id="tools">
				<el-radio-button v-for="item in tools" :key="item" :label="item" :id="item"/>
			</el-radio-group>
			<el-radio-group v-model="worldSpace" size="mini" id="worldSpace">
				<el-radio-button v-for="item in worldSpaces" :key="item" :label="item" :id="item"/>
			</el-radio-group>
		</div>
		<div id="toolbarCenter">
		</div>
		<div id="toolbarRight">
			<el-select name="WorldView" id="worldView" :default-first-option=true v-model="worldView" size="mini">
				<el-option v-for="item in worldViews" :key="item.value" :label="item.label" :value="item.value"/>
			</el-select>
		</div>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, PropSync } from 'vue-property-decorator';

@Component
export default class EditorToolbar extends Vue {
	private worldView = 0;
	private tool = 'Select';
	private worldSpace = 'World';

	private worldSpaces = ['Local', 'World'];
	private tools = ['Select', 'Translate', 'Rotate', 'Scale'];

	private worldViews = [{
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
	}]
}
</script>
<style lang="scss">
#tools input+span, #worldSpace input+span {
	font-size: 0!important;
	height: 30px;
	width: 30px;
}
#tools input[value="Select"]+span {
	-webkit-mask: url(../../../icons/editor/cursor-default-outline.svg) no-repeat center;
}
#tools input[value="Translate"]+span {
	-webkit-mask: url(../../../icons/editor/cursor-move.svg) no-repeat center;
}
#tools input[value="Rotate"]+span {
	-webkit-mask: url(../../../icons/editor/rotate-3d.svg) no-repeat center;
}
#tools input[value="Scale"]+span {
	-webkit-mask: url(../../../icons/editor/arrow-expand.svg) no-repeat center;
}

#worldSpace input[value="Local"]+span {
	-webkit-mask: url(../../../icons/editor/cube-outline.svg) no-repeat center;
}
#worldSpace input[value="World"]+span {
	-webkit-mask: url(../../../icons/editor/earth.svg) no-repeat center;
}
</style>
<style lang="scss" scoped>
#toolbar {
	z-index: 2147483647;
	left: 0;
	top: 0;
	width: 100%;
	height: 30px;
	background-color: rgba(34, 34, 34, 0.8);
	display: flex;
	justify-content: space-between;
	border-bottom: 2px solid black;
	position: relative;
}
.el-radio-group {
	background-color: #ffffff36;
	border-radius: 5px;
	padding-left: 5px;
	padding-right: 5px;
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
#menubar.ui-menu { list-style:none; padding: 2px; margin: 0; display:block; outline: none; background-color: rgba(34, 34, 34, 0.8); color: #999; }
#menubar.ui-menu .ui-menu { margin-top: -3px; position: absolute; display: grid;}
#menubar.ui-menu .ui-menu-item {
	display: inline-block;
	float: left;
	margin: 0;
	padding: 0;
	width: auto;
}
#menubar.ui-menu .ui-menu-divider { height: 0; font-size: 0; line-height: 0; border-width: 1px 0 0 0; }
#menubar.ui-menu .ui-menu-item a { text-decoration: none; display: block; padding: 2px .4em; zoom: 1; font-weight: normal; }
#menubar.ui-menu .ui-menu-item a.ui-state-focus,
#menubar.ui-menu .ui-menu-item a.ui-state-active { font-weight: normal;  }

#menubar.ui-menu .ui-state-disabled { font-weight: normal; }
#menubar.ui-menu .ui-state-disabled a { cursor: default; }
#menubar.ui-menu:after {
	content: ".";
	display: block;
	clear: both;
	visibility: hidden;
	line-height: 0;
	height: 0;
}

li.ui-widget-seperator {
	font-size: 0;
	height: 0;
	border-bottom: 1px solid #afafaf;
	margin: 5px;
}
label i {
	padding: 12px;
	background:
			#b9b9b9;
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
</style>
