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
import { Vue, Component, Prop } from 'vue-property-decorator';
@Component
export default class Search extends Vue {
	@Prop(String) private value: string;
	@Prop(String) private search: string;
}
</script>

<style lang="scss" scoped></style>
