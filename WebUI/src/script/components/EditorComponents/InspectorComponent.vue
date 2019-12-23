<template>
	<gl-component>
		<div v-if="syncedGameObject">
			<div class="header">
				<label for="enabled">Enabled:</label><input type="checkbox" id="enabled" ref="enabled" v-model="gameObject.enabled" @change="onEnableChange">
				<input :value="gameObject.name" @change="onNameChange">
				<DraggableNumberInput></DraggableNumberInput>
			</div>
		</div>
	</gl-component>
</template>

<script lang="ts">
import { Component, Prop, PropSync } from 'vue-property-decorator';
import EditorComponent from './EditorComponent.vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';
import SetObjectNameCommand from '@/script/commands/SetObjectNameCommand';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';

@Component({ components: { DraggableNumberInput } })
export default class InspectorComponent extends EditorComponent {
	@PropSync('gameObject') syncedGameObject: GameObject;

	private gameObject: GameObject;
	constructor() {
		super();
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
	}

	private onSelectedGameObject(guid: Guid) {
		const go = window.editor.getGameObjectByGuid(guid);
		if (go) {
			this.gameObject = go;
		}
	}

	private onEnableChange(e: Event) {
		(this.$refs.enabled as any).checked = this.gameObject.enabled;
	}

	private onNameChange(e: InputEvent) {
		if ((e.target as any).value) {
			window.editor.execute(new SetObjectNameCommand(this.gameObject.getGameObjectTransferData(), (e.target as any).value));
		}
	}
}
</script>
<style scoped>
	input {
		width: 100%;
	}
</style>
