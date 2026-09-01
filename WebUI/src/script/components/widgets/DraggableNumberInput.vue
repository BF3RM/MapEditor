<template>
	<div class="vue-draggable-number-container" :class="inputName" @mousedown="onFieldMouseDown">
		<lazy-input
			type="number"
			:min="min"
			:max="max"
			:name="inputName"
			:step="step"
			v-model="formattedValue"
			@blur="$emit('blur')"
		/>
		<label :for="inputName" :style="{ cursor: cursorDirection }" v-if="!hideLabel">
			{{ label }}
		</label>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

import LazyInput from './LazyInput.vue';

export default defineComponent({
	name: 'DraggableNumberInput',
	components: {
		LazyInput
	},
	props: {
		dragDirection: {
			type: String,
			default: 'Y'
		},
		hideLabel: {
			type: Boolean,
			default: false
		},
		label: {
			type: String,
			required: true
		},
		max: {
			type: Number
		},
		min: {
			type: Number
		},
		step: {
			type: Number,
			default: 1
		},
		value: {
			type: Number,
			required: true
		},
		type: {
			type: String,
			required: true
		}
	},
	data() {
		return { fieldStartX: 0, fieldStartVal: 0, fieldDidDrag: false };
	},
	computed: {
		boundFieldMove(): (e: MouseEvent) => void {
			return this.onFieldMove.bind(this);
		},
		boundFieldUp(): () => void {
			return this.onFieldUp.bind(this);
		},
		boundAdjust(): (event: MouseEvent) => void {
			return this.onDrag.bind(this);
		},
		boundEnd(): () => void {
			return this.dragEnd.bind(this);
		},
		cursorDirection(): 'ns-resize' | 'ew-resize' {
			return this.dragDirection === 'Y' ? 'ns-resize' : 'ew-resize';
		},
		inputName(): string {
			return `draggable-number-${this.label.toLowerCase().replace(' ', '-')}`;
		},
		formattedValue: {
			get(): string {
				return Number(this.value).toFixed(2);
			},
			set(val: string) {
				let newVal = val === '' ? 0 : Number(val);

				if (this.min !== undefined && !Number.isNaN(this.min) && newVal < this.min) {
					newVal = Math.max(newVal, this.min);
				}
				if (this.max !== undefined && !Number.isNaN(this.max) && newVal > this.max) {
					newVal = Math.min(newVal, this.max);
				}

				// TODO: Sanitize
				console.log('Numba: ' + newVal);
				console.log('TODO: ' + this.type);

				this.$emit('input', newVal);
			}
		}
	},
	methods: {
		// UE5-style scrub: hold left-click on the field and drag left/right to
		// decrease/increase. A plain click (no drag) still focuses the input to type.
		onFieldMouseDown(e: MouseEvent): void {
			if (e.button !== 0) return;
			this.fieldStartX = e.clientX;
			this.fieldStartVal = Number(this.value);
			this.fieldDidDrag = false;
			document.addEventListener('mousemove', this.boundFieldMove);
			document.addEventListener('mouseup', this.boundFieldUp);
			// Gameface: do NOT preventDefault here. Blocking native focus and then
			// re-focusing on mouseup relies on a document-level mouseup + input.focus()
			// that Cohtml doesn't fire reliably — so vector fields became un-clickable
			// (you couldn't focus them to type, while plain NumberControl inputs worked).
			// Let the native click focus the input; a real drag (detected in onFieldMove)
			// blurs the input and scrubs instead.
		},
		onFieldMove(e: MouseEvent): void {
			const dx = e.clientX - this.fieldStartX;
			if (!this.fieldDidDrag && Math.abs(dx) < 3) return;
			if (!this.fieldDidDrag) {
				this.fieldDidDrag = true;
				document.body.style.cursor = 'ew-resize';
				document.body.style.userSelect = 'none';
				const active = document.activeElement as HTMLElement | null;
				if (active && active.blur) active.blur();
				this.$emit('dragstart');
			}
			this.formattedValue = (this.fieldStartVal + dx * this.step).toFixed(2);
			e.preventDefault();
		},
		onFieldUp(): void {
			document.removeEventListener('mousemove', this.boundFieldMove);
			document.removeEventListener('mouseup', this.boundFieldUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			if (this.fieldDidDrag) {
				this.$emit('dragend');
			} else {
				// Plain click -> focus the input for typing (we blocked native focus).
				const input = (this.$el as HTMLElement).querySelector('input') as HTMLInputElement | null;
				if (input) {
					input.focus();
					input.select();
				}
			}
		},
		onDrag(event: MouseEvent): void {
			if (event.clientX > window.innerWidth - 2) {
				console.log('Right edge');
				window.editor.threeManager.inputControls.TeleportMouse(event, 'left');
			}

			if (event.clientX < 2) {
				console.log('Left edge');
				window.editor.threeManager.inputControls.TeleportMouse(event, 'right');
			}

			const newValDelta =
				this.dragDirection === 'Y'
					? -window.editor.threeManager.inputControls.movementY * this.step
					: window.editor.threeManager.inputControls.movementX * this.step;

			this.formattedValue = (this.value + newValDelta).toFixed(2);
		},
		dragStart(): void {
			document.body.style.cursor = this.cursorDirection;
			document.body.style.userSelect = 'none';

			document.addEventListener('mousemove', this.boundAdjust);
			document.addEventListener('mouseup', this.boundEnd);

			this.$emit('dragstart');
		},
		dragEnd(): void {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';

			document.removeEventListener('mousemove', this.boundAdjust);
			document.removeEventListener('mouseup', this.boundEnd);

			this.$emit('dragend');
		}
	}
});
</script>

<style lang="scss" scoped>
.vue-draggable-number-container {
	display: flex;
	flex-direction: row;
	align-items: center;

	label {
		padding-left: 0.2em;
		padding-right: 0.1em;
		order: 2; /* axis label sits to the RIGHT of the value box */
		flex: 0 0 auto;
	}

	/* The real <input> lives inside the LazyInput child component, so a plain scoped
	   `input {}` selector does NOT reach it -> use ::v-deep. This is also why the
	   earlier user-select fix didn't take. */
	::v-deep input {
		order: 1;
		flex: 1 1 0;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		border-radius: 0.3vmin;
		padding-left: 0.5vmin;
		/* Cohtml selects the number on drag despite preventDefault/user-select. Make the
		   input transparent to the mouse so mousedown hits the container (drag scrubs,
		   no text selection); typing still works via the programmatic focus in
		   onFieldUp (pointer-events only blocks the mouse, not the keyboard). */
		pointer-events: none;
		-webkit-user-select: none;
		user-select: none;
	}
}
</style>
