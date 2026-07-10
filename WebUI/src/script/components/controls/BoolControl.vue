<template>
	<div class="BoolControl">
		<el-checkbox :value="value" @input="onChangeValue"></el-checkbox>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
    name: 'BoolControl',
    props: {
        value: {
            type: Boolean,
            required: true
        }
    },
    methods: {
        onChangeValue(newVal: boolean) {
            this.$emit('input', newVal);
        }
    }
});
</script>

<style lang="scss" scoped>
.BoolControl input {
	width: 1em;
}
</style>
