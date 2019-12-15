<template>
	<input class="search" placeholder="Search..." v-model="search"/>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
@Component
export default class Search extends Vue {
	@Prop(String) private text: string;
	@Prop(String) private search: string;
}
</script>

<style lang="scss">
	input {
		height: 20px;
	}
</style>
