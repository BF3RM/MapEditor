<template>
	<div class="BoolControl">
		<el-checkbox v-model="value" @input="onChangeValue"></el-checkbox>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component({ components: {} })
export default class BoolControl extends Vue {
	@Prop() value: string;

	onChangeValue(newVal: string) {
		this.$emit('input', newVal);
	}
}
</script>

<style lang="scss" scoped>
.BoolControl input {
	width: 1em;
}
</style>
