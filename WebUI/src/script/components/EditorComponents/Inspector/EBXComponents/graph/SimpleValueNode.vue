<template>
    <div class="simple-value-node">
        <slot name="partition"></slot>

        <h3>
            {{ type }}:
            {{ instance.fields.defaultValue.value }}
        </h3>

        <slot></slot>
    </div>
</template>

<script lang="ts">
import Vue, {PropType} from 'vue';
import {Node} from 'rete';

import Instance from '../../ebx/Instance';
import {typeNameMappings} from '../../ebx/types';

export default Vue.extend({
    name: 'SimpleValueNode',
    props: {
        node: {
            type: Object as PropType<Node>,
            required: true,
        },
        instance: {
            type: Object as PropType<Instance>,
            required: true,
        },
    },
    computed: {
        type(): string {
            const type = this.instance.fields.defaultValue.type;
            return `${typeNameMappings[type] || type}`;
        },
        value(): string {
            return `${this.instance.fields.defaultValue.value}`;
        },
    },
});
</script>

<style lang="scss" scoped>

.simple-value-node {
  min-width: 300px;

  h3 {
    text-align: center;
  }
}

</style>
