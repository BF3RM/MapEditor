<template>
	<div class="Vec4Control">
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
		<DraggableNumberInput
			class="z"
			label="Z"
			type="Float"
			dragDirection="X"
			:hideLabel="hideLabel"
			:value="local.z"
			:step="step"
			:min="min"
			@input="onChangeValue('z', $event)"
			@blur="$emit('blur')"
			@dragstart="$emit('dragstart')"
			@dragend="$emit('dragend')"
		/>
		<DraggableNumberInput
			class="w"
			label="W"
			type="Float"
			dragDirection="X"
			:hideLabel="hideLabel"
			:value="local.w"
			:step="step"
			:min="min"
			@input="onChangeValue('w', $event)"
			@blur="$emit('blur')"
			@dragstart="$emit('dragstart')"
			@dragend="$emit('dragend')"
		/>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';
import { Vec4 } from '@/script/types/primitives/Vec4';

export default defineComponent({
    name: 'Vec4Control',
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
            type: Object as () => Vec4,
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
            local: (this.value as Vec4).clone()
        };
    },
    watch: {
        value(newVal: Vec4) {
            this.local = newVal.clone();
        }
    },
    methods: {
        onChangeValue(axis: string, val: number) {
            const newVal = (this.local as Vec4).clone();

            switch (axis) {
                case 'x':
                    newVal.x = val;
                    break;
                case 'y':
                    newVal.y = val;
                    break;
                case 'z':
                    newVal.z = val;
                    break;
                case 'w':
                    newVal.w = val;
            }

            this.local = newVal;
            this.$emit('input', newVal.clone());
        }
    }
});
</script>

<style lang="scss" scoped>
.Vec4Control {
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
	> .y,
	> .z,
	> .w {
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

		&.z {
			color: #037fff;
		}

		&.w {
			color: #c58bff;
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
