<template>
    <div class="logic-node">
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

export default Vue.extend({
    name: 'LogicNode',
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
            switch (this.instance.type) {
                case 'AndEntityData':
                    return 'AND';
                case 'NotEntityData':
                    return 'NOT';
                case 'OrEntityData':
                case 'Or4EntityData':
                    return 'OR';
                default:
                    return '???';
            }
        },
    },
});
</script>

<style lang="scss" scoped>

$logic-node-width: 300px;

.logic-node {
    position: relative;
    min-width: $logic-node-width;

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

        font-size: 2rem;
        font-weight: bold;
        text-align: center;
    }
}

</style>
