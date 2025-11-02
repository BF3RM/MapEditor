<template>
	<div class="vue-draggable-number-container" :class="inputName">
		<label :for="inputName" :style="{ cursor: cursorDirection }" @mousedown="dragStart" v-if="!hideLabel">
			{{ label }}
		</label>
		<lazy-input
			type="number"
			:min="min"
			:max="max"
			:name="inputName"
			:step="step"
			v-model="formattedValue"
			@blur="$emit('blur')"
		/>
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
            type: Number,
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
    computed: {
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
		padding-left: 0.4em;
		padding-right: 0.2em;
	}

	input {
		border-radius: 0.3vmin;
		padding-left: 0.5vmin;
	}
}
</style>
