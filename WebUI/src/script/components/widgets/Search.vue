<template>
	<!-- Gameface port: Cohtml doesn't render the native `placeholder` -> manual span. -->
	<div class="search-wrap">
		<input
			class="search"
			type="text"
			:value="value"
			@change="$emit('search', $event.target.value)"
			@input="$emit('input', $event.target.value)"
		/>
		<span class="search-ph" v-show="!value">Search...</span>
	</div>
</template>

<style scoped>
.search-wrap {
	position: relative;
	display: flex;
	flex: 1 1 auto;
	min-width: 0;
}
.search-wrap .search {
	flex: 1 1 auto;
	min-width: 0;
}
.search-ph {
	position: absolute;
	left: 8px;
	top: 50%;
	transform: translateY(-50%);
	color: #6b7a8d;
	font-size: 12px;
	pointer-events: none;
}
</style>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
	name: 'Search',
	props: {
		value: {
			type: String,
			required: false
		}
	}
});
</script>
