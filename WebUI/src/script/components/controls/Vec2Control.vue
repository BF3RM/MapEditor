<template>
	<div class="Vec2Control">
		<div class="label">
			<span v-if="label">{{ label }}</span>
		</div>
		<DraggableNumberInput
			class="x"
			label="X"
			type="Float"
			dragDirection="X"
			:hideLabel="hideLabel"
			:value="local.x"
			:step="step"
			:min="min"
			@input="onChangeValue('x', $event)"
			@blur="$emit('blur')"
			@dragstart="$emit('dragstart')"
			@dragend="$emit('dragend')"
		/>
		<DraggableNumberInput
			class="y"
			label="Y"
			type="Float"
			dragDirection="X"
			:hideLabel="hideLabel"
			:value="local.y"
			:step="step"
			:min="min"
			@input="onChangeValue('y', $event)"
			@blur="$emit('blur')"
			@dragstart="$emit('dragstart')"
			@dragend="$emit('dragend')"
		/>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Vec2 } from '@/script/types/primitives/Vec2';

export default defineComponent({
    name: 'Vec2Control',
    components: {
        DraggableNumberInput
    },
    props: {
        label: {
            type: String,
            required: false
        },
        step: {
            type: Number,
            default: 0.014
        },
        value: {
            type: Object as () => Vec2,
            required: true
        },
        min: {
            type: Number,
            required: false
        },
        hideLabel: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            // Persistent working copy so multi-axis edits accumulate (see Vec3Control).
            local: (this.value as Vec2).clone()
        };
    },
    watch: {
        value(newVal: Vec2) {
            this.local = newVal.clone();
        }
    },
    methods: {
        onChangeValue(axis: string, val: number) {
            const newVal = (this.local as Vec2).clone();

            switch (axis) {
                case 'x':
                    newVal.x = val;
                    break;
                case 'y':
                    newVal.y = val;
            }

            this.local = newVal;
            this.$emit('input', newVal.clone());
        }
    }
});
</script>

<style lang="scss" scoped>
.Vec2Control {
	/* Gameface (Cohtml 2.2.7) does NOT render CSS Grid -> flexbox. */
	display: flex;
	flex-flow: row nowrap;
	align-items: center;
	gap: 3px;

	> .label {
		flex: 0 0 42px;
		min-width: 0;
	}

	> .x,
	> .y {
		flex: 1 1 0;
		min-width: 0;
	}

	.vue-draggable-number-container {
		font-weight: 900;
		font-size: 14px;

		&::v-deep input {
			margin-left: 4px;
		}

		&.x {
			color: #ff2a2a;
		}

		&.y {
			color: #35ff68;
		}
	}

	span {
		font-size: 10px;
		text-transform: uppercase;
		font-weight: 600;
		color: #fff;
	}
}
</style>
