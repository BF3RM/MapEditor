<template>
	<div
			class="vue-draggable-number-container"
			:class="inputName"
			@mousedown="dragStart">
		<label
				:for="inputName"
				:style="{ cursor: cursorDirection }"
				v-if="!hideLabel">
			{{ label }}
		</label>
		<input
				type="number"
				:max="max"
				:min="min"
				:name="inputName"
				:step="step"
				:value="value"
				@input="adjustValue($event.target.value)">
	</div>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

@Component
export default class DraggableNumberInput extends Vue {
	get boundAdjust() {
		return this.adjustValue.bind(this);
	}

	get boundEnd(): EventListener {
		return this.dragEnd.bind(this);
	}

	get cursorDirection(): 'ns-resize' | 'ew-resize' {
		return this.dragDirection === 'Y' ? 'ns-resize' : 'ew-resize';
	}

	get inputName(): string {
		return `draggable-number-${this.label.toLowerCase().replace(' ', '-')}`;
	}

	public isDragging = false;

	@Prop({ default: 'Y', type: String })
	private dragDirection!: 'X' | 'Y';

	@Prop({ default: false, type: Boolean })
	private hideLabel: boolean = false;

	@Prop({ required: true, type: String })
	private label!: string;

	@Prop({ type: Number })
	private max!: number;

	@Prop({ type: Number })
	private min!: number;

	@Prop({ default: 1, type: Number })
	private step!: number;

	@Prop({ required: true, type: Number })
	private value!: number;

	@Emit('input')
	private adjustValue(val: number | string | MouseEvent): number {
		let newVal;

		if (val instanceof MouseEvent) {
			newVal = this.dragDirection === 'Y' ? -val.movementY : val.movementX;
			newVal = Number(this.value + newVal);
		} else { newVal = Number(val); }

		if (!isNaN(this.min) && newVal < this.min) { newVal = Math.max(newVal, this.min); }
		if (!isNaN(this.max) && newVal > this.max) { newVal = Math.min(newVal, this.max); }

		return newVal;
	}

	private dragEnd(): void {
		this.isDragging = false;

		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		document.removeEventListener('mousemove', this.boundAdjust);
		document.removeEventListener('mouseup', this.boundEnd);
	}

	private dragStart(): void {
		this.isDragging = true;

		document.body.style.cursor = this.cursorDirection;
		document.body.style.userSelect = 'none';

		document.addEventListener('mousemove', this.boundAdjust);
		document.addEventListener('mouseup', this.boundEnd);
	}
}
</script>

<style scoped>
</style>
