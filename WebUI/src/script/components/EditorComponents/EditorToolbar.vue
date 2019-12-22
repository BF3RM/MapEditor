<template>
	<div id="toolbar">
		<div id="toolbarLeft">
			<ul id="menubar">
			</ul>
			<div id="tools">
				<input type="radio" name="tools" id="select" checked="">
				<label for="select"><i class="selectIcon" @click="editor.threeManager.SetGizmoMode('select')"></i></label>
				<input type="radio" name="tools" id="translate">
				<label for="translate"><i class="translateIcon" @click="editor.threeManager.SetGizmoMode('translate')"></i></label>
				<input type="radio" name="tools" id="rotate">
				<label for="rotate"><i class="rotateIcon" @click="editor.threeManager.SetGizmoMode('rotate')"></i></label>
				<input type="radio" name="tools" id="scale">
				<label for="scale"><i class="scaleIcon" @click="editor.threeManager.SetGizmoMode('scale')"></i></label>
			</div>

			<div id="worldSpace">
				<input type="radio" name="worldSpace" id="local" checked="">
				<label for="local"><i class="cubeIcon"></i>Local</label>
				<input type="radio" name="worldSpace" id="world">
				<label for="world"><i class="globeIcon"></i>World</label>
			</div>
		</div>
		<div id="toolbarCenter">
		</div>
		<div id="toolbarRight">
			<select name="WorldView" id="worldView">
				<option value="0" selected="selected">Default</option>
				<option value="1">Raw Linear</option>
				<option value="2">Raw Linear Alpha</option>
				<option value="3">Diffuse</option>
				<option value="4">Specular</option>
				<option value="5">Emissive</option>
				<option value="6">Normal</option>
				<option value="7">Smoothness</option>
				<option value="8">Material</option>
				<option value="9">Light</option>
				<option value="10">Light Diffuse</option>
				<option value="11">Light Specular</option>
				<option value="12">Light Indirect</option>
				<option value="13">Light Translucency</option>
				<option value="14">Light Overdraw</option>
				<option value="15">Sky Visibility</option>
				<option value="16">Sky Visibility Raw</option>
				<option value="17">Overdraw</option>
				<option value="18">Dynamic AO</option>
				<option value="19">Occluders</option>
				<option value="20">Radiosity Light Maps</option>
				<option value="21">Radiosity Diffuse Color</option>
				<option value="22">Radiosity Target UV</option>
				<option value="23">Velocity Vector</option>
				<option value="24">Distortion Vector</option>
			</select>
		</div>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, PropSync } from 'vue-property-decorator';
@Component
export default class EditorToolbar extends Vue {
	mounted() {
	}
}
</script>
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
div#worldSpace {
	margin-left: 10px;
}
div#tools {
	margin-left: 10px;
}
#tools label {
	padding: 0;
	padding-top: 5px;
}
#worldSpace label {
	padding: 0;
	padding-left: 2px;
	padding-right: 2px;
	margin-left: 5px;
	padding-top: 5px;
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
#worldView-button {
	margin-left: calc(100% - 14em);
}
#tools li {
	height: 25px;
	width: 25px;
	text-align: center;
	background-color: #f6f6f6;
	border-radius: 5px;
	border: 1px solid #c5c5c5;
	line-height: 21px;
	margin-left: 10px;
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
