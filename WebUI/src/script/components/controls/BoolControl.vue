<template>
	<div class="BoolControl">
		<el-checkbox v-model="value" @input="onChangeValue($event)"></el-checkbox>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Emit } from 'vue-property-decorator';

@Component({ components: { } })
export default class BoolControl extends Vue {
	@Prop() value: string;

	onChangeValue() {
		this.$emit('input', this.value);
	}
}
</script>

<style lang="scss" scoped>
.BoolControl input {
	width:1em;
}
</style>
