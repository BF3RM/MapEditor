<template>
    <div class="default-node">
        <slot name="partition"></slot>
        <slot name="type"></slot>

        <slot></slot>
    </div>
</template>

<script lang="ts">
import Vue, {PropType} from 'vue';
import {Node} from 'rete';

import Partition from '../../ebx/Partition';
import Instance from '../../ebx/Instance';

export default Vue.extend({
    name: 'DefaultNode',
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
        partition(): Partition {
            return this.instance.partition;
        },
    },
});
</script>

<style lang="scss" scoped>

.default-node {
  min-width: 600px;
}

</style>
