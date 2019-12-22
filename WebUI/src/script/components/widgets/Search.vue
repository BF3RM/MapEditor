<template>
	<input class="search" type="search" placeholder="Search..." v-model="search"/>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
@Component
export default class Search extends Vue {
	@Prop(String) private text: string;
	@Prop(String) private search: string;
}
</script>

<style lang="scss" scoped>
input {
	height: 20px;
	width: 100%;
	padding: 0;
	margin: 0;
	border: 0;
	background-color: rgba(0, 0, 0, 0.4) !important;
	color: #fff;
}

</style>
