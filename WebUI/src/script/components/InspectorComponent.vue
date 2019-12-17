<template>
	<gl-component>
		<div v-if="syncedGameObject">
			<div class="header">
				<label for="enabled">Enabled:</label><input type="checkbox" id="enabled" ref="enabled" v-model="gameObject.enabled" @change="onEnableChange">
				<input :value="gameObject.name" @change="onNameChange">
				<DraggableInput></DraggableInput>
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
import DraggableInput from '@/script/components/widgets/DraggableInput.vue';

@Component({ components: { DraggableInput } })
export default class InspectorComponent extends EditorComponent {
	@Prop() title: string;
	@PropSync('gameObject') syncedGameObject!: GameObject;

	private gameObject: GameObject;
	constructor() {
		super();
		signals.selectedGameObject.connect(this.onSelectedGameObject.bind(this));
	}

	private onSelectedGameObject(guid: Guid) {
		this.gameObject = window.editor.getGameObjectByGuid(guid);
	}

	private onEnableChange(e: Event) {
		this.$refs.enabled.checked = this.gameObject.enabled;
	}

	private onNameChange(e: InputEvent) {
		window.editor.execute(new SetObjectNameCommand(this.gameObject.getGameObjectTransferData(), e.target.value));
	}
}
</script>
<style scoped>
	input {
		width: 100%;
	}
</style>
