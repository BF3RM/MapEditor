<template>
	<div class="StringControl">
		<input type="text" :value="value" @input="$emit('input', $event)" />
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
    name: 'StringControl',
    props: {
        value: {
            type: String,
            required: true
        }
    }
});
</script>
