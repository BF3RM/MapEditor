<template>
    <div class="compare-node">
        <slot name="partition"></slot>

        <div class="operator columns">
            <span :title="this.instance.fields.operator.enumValue">{{ operator }}</span>
        </div>

        <slot></slot>
    </div>
</template>

<script lang="ts">
import Vue, {PropType} from 'vue';
import {Node} from 'rete';

import Instance from '../../ebx/Instance';

export default Vue.extend({
    name: 'CompareNode',
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
        operator(): string {
            switch (this.instance.fields.operator.enumValue) {
                case 'CompareOp_Equal':
                    return '==';
                case 'CompareOp_NotEqual':
                    return '!=';
                case 'CompareOp_Greater':
                    return '>';
                case 'CompareOp_Less':
                    return '<';
                case 'CompareOp_GreaterOrEqual':
                    return '>=';
                case 'CompareOp_LessOrEqual':
                    return '<=';
                default:
                    return '???';
            }
        },
    },
});
</script>

<style lang="scss" scoped>

$compare-node-width: 300px;

.compare-node {
  min-width: $compare-node-width;

  .operator {
    display: flex;
    justify-content: center;
    align-items: center;

    position: absolute;
    left: 0;
    top: 0;

    margin: 0;

    width: 100%;
    height: 100%;

    font-size: 3rem;
    font-weight: bold;
    text-align: center;
  }
}

</style>
