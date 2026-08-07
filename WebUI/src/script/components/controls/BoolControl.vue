<template>
	<div class="BoolControl">
		<!-- Gameface port: el-checkbox (native <input type=checkbox>) does not toggle in
		     Cohtml and emits `change`, not the `input` this was wired to — so bool fields
		     were dead. Plain clickable div instead, same pattern as the inspector
		     Enable/Disable checkbox. -->
		<span class="fx-checkbox-box" :class="{ checked: local }" @click="toggle">
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
    data() {
        return {
            // Local copy so the checkbox flips on click regardless of the prop round-trip. Without
            // it, the click emitted !value but nothing re-rendered, so it looked dead and every
            // click re-sent the same value (this.value never changed).
            local: this.value as boolean
        };
    },
    watch: {
        value(v: boolean) {
            this.local = v;
        }
    },
    methods: {
        toggle() {
            this.local = !this.local;
            this.$emit('input', this.local);
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
