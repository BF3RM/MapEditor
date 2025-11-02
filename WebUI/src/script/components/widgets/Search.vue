<template>
	<input
		class="search"
		type="search"
		placeholder="Search..."
		:value="value"
		@change="$emit('search', $event.target.value)"
		@input="$emit('input', $event.target.value)"
	/>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
	name: 'Search',
	props: {
		value: {
			type: String,
			required: false
		},
	}
});
</script>
