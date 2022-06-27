<template>
	<div class="StringControl">
		<input type="text" :value="value" @input="$emit('input', $event)" />
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component({ components: {} })
export default class StringControl extends Vue {
	@Prop() value: string;
}
</script>

<style lang="scss" scoped></style>
