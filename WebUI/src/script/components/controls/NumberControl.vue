<template>
	<div class="NumberControl">
		<DraggableNumberInput
			@blur="$emit('blur')"
			:hideLabel="true"
			dragDirection="X"
			:value="value"
			label="X"
			:step="step"
			:min="min"
			@input="$emit('input', $event)"
			@startDrag="onStartDrag"
			@endDrag="onEndDrag"
			:type="type"
		/>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';

export default defineComponent({
    name: 'NumberControl',
    components: {
        DraggableNumberInput
    },
    props: {
        step: {
            type: Number,
            default: 0.014
        },
        value: {
            type: Number,
            required: true
        },
        min: {
            type: Number,
            required: false
        },
        type: {
            type: String,
            required: false
        }
    },
    methods: {
        onStartDrag(event: number) {
            this.$emit('input', event);
            return event;
        },
        onEndDrag(event: number) {
            this.$emit('input', event);
            return event;
        }
    }
});
</script>
