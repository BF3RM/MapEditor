<template>
    <div class="math-op-node">
        <slot name="partition"></slot>

        <div class="operator columns">
            <span>{{ operator }}</span>
        </div>

        <slot></slot>
    </div>
</template>

<script lang="ts">
import Vue, {PropType} from 'vue';
import {Node} from 'rete';

import Instance from '../../ebx/Instance';
import Field from '../../ebx/Field';

const ops: { [value: string]: string } = {
    0: '+',
    1: '-',
    2: '*',
    3: '/',
    4: 'min',
    5: 'max',
};

export default Vue.extend({
    name: 'MathOpNode',
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
            return this.instance.fields.operators.value.map((op: Field<any>) => ops[op.value]).join(', ');
        },
    },
});
</script>

<style lang="scss" scoped>

$compare-node-width: 300px;

.math-op-node {
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
