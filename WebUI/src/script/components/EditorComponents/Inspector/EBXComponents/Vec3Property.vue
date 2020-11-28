<template>
    <div class="field-body">
        <label class="field has-addons x">
            <span class="control button is-small is-static">X</span>
            <input type="text" readonly :value="field.value.x" class="input is-small">
        </label>
        <label class="field has-addons y">
            <span class="control button is-small is-static">Y</span>
            <input type="text" readonly :value="field.value.y" class="input is-small y">
        </label>
        <label class="field has-addons z">
            <span class="control button is-small is-static">Z</span>
            <input type="text" readonly :value="field.value.z" class="input is-small z">
        </label>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import Field from '../../../../types/ebx/Field';

export default Vue.extend({
	name: 'Vec3Property',
	props: {
		field: {
			type: Object as PropType<Field<any>>,
			required: true
		}
	}
});
</script>

<style lang="scss" scoped>

.field-body {
  flex-grow: 9;
}

.x {
  input, .button {
    background-color: #3e0000;
  }
}

.y {
  input, .button {
    background-color: #193c00;
  }
}

.z {
  input, .button {
    background-color: #00274f;
  }
}

</style>
