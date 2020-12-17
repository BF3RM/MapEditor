<template>
	<div
			class="vue-draggable-number-container"
			:class="inputName"
			>
		<label
				:for="inputName"
				:style="{ cursor: cursorDirection }"
				@mousedown="dragStart"
				v-if="!hideLabel">
			{{ label }}
		</label>
    <lazy-input
		type="number"
		:min="max"
		:max="min"
		:name="inputName"
		:step="step"
		v-model="formattedValue"
		@blur="$emit('blur')"
    />
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

import LazyInput from './LazyInput.vue';

@Component({ components: { LazyInput } })
export default class DraggableNumberInput extends Vue {
	get boundAdjust() {
		return this.onDrag.bind(this);
	}

	get boundEnd() {
		return this.dragEnd.bind(this);
	}

	get cursorDirection(): 'ns-resize' | 'ew-resize' {
		return this.dragDirection === 'Y' ? 'ns-resize' : 'ew-resize';
	}

	get inputName(): string {
		return `draggable-number-${this.label.toLowerCase().replace(' ', '-')}`;
	}

	@Prop({ default: 'Y', type: String })
	private dragDirection: 'X' | 'Y';

	@Prop({ default: false, type: Boolean })
	private hideLabel: boolean;

	@Prop({ required: true, type: String })
	private label: string;

	@Prop({ type: Number })
	private max: number;

	@Prop({ type: Number })
	private min: number;

	@Prop({ default: 1, type: Number })
	private step: number;

	@Prop({ required: true, type: Number })
	private value: number;

	@Prop({ required: true, type: String })
	private type: number;

	set formattedValue(val: string) {
		let newVal = val === '' ? 0 : Number(val);

		if (!Number.isNaN(this.min) && newVal < this.min) { newVal = Math.max(newVal, this.min); }
		if (!Number.isNaN(this.max) && newVal > this.max) { newVal = Math.min(newVal, this.max); }

		// TODO: Sanitize
		console.log('Numba: ' + newVal);
		console.log('TODO: ' + this.type);
		this.$emit('input', newVal);
	}

	private onDrag(event: MouseEvent) {
		if (event.clientX > window.innerWidth - 2) {
			console.log('Right edge');
			window.editor.threeManager.inputControls.TeleportMouse(event, 'left');
		}

		if (event.clientX < 2) {
			console.log('Left edge');
			window.editor.threeManager.inputControls.TeleportMouse(event, 'right');
		}

		const newValDelta = this.dragDirection === 'Y' ? -window.editor.threeManager.inputControls.movementY * this.step : window.editor.threeManager.inputControls.movementX * this.step;

		this.formattedValue = (this.value + newValDelta).toFixed(2);
	}

	get formattedValue() {
		return Number(this.value).toFixed(2);
	}

	private dragEnd(): void {
		console.log('dragend');

		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		document.removeEventListener('mousemove', this.boundAdjust);
	}

	private dragStart(): void {
		console.log('dragstart');

		document.body.style.cursor = this.cursorDirection;
		document.body.style.userSelect = 'none';

		document.addEventListener('mousemove', this.boundAdjust);
		document.addEventListener('mouseup', this.boundEnd);
	}
}
</script>

<style lang="scss" scoped>
	.vue-draggable-number-container {
		display: flex;
		flex-direction: row;
		align-items: center;
		padding-top: 0.2em;
		label {
			padding-left: 0.4em;
			padding-right: 0.2em;
		}
		input {
			border-radius: 0.3vmin;
			padding-left: 0.5vmin;
		}
	}
</style>
