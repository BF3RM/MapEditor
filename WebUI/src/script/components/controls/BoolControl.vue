<template>
	<div class="BoolControl">
		<!-- Gameface port: el-checkbox (native <input type=checkbox>) does not toggle in
		     Cohtml and emits `change`, not the `input` this was wired to — so bool fields
		     were dead. Plain clickable div instead, same pattern as the inspector
		     Enable/Disable checkbox. -->
		<span class="fx-checkbox-box" :class="{ checked: value }" @click="toggle">
			<span class="fx-check"></span>
		</span>
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
        toggle() {
            this.$emit('input', !this.value);
        }
    }
});
</script>

<style lang="scss" scoped>
.BoolControl .fx-checkbox-box {
	position: relative;
	display: inline-block;
	width: 18px;
	height: 18px;
	border-radius: 3px;
	background: #eee;
	cursor: pointer;
	box-sizing: border-box;
}
.BoolControl .fx-checkbox-box.checked {
	background: #037fff;
}
.BoolControl .fx-check {
	display: none;
}
.BoolControl .fx-checkbox-box.checked .fx-check {
	display: block;
	position: absolute;
	left: 6px;
	top: 1px;
	width: 6px;
	height: 11px;
	border: solid #fff;
	border-width: 0 3px 3px 0;
	transform: rotate(45deg);
}
</style>
