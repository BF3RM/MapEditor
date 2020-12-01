<template>
	<div class="StringControl">
		<input type="text" :value="value"/>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop, Emit } from 'vue-property-decorator';

@Component({ components: { } })
export default class StringControl extends Vue {
	@Prop() value: string;

	onChangeValue() {
		this.$emit('input');
	}
}
</script>

<style lang="scss" scoped>
</style>
