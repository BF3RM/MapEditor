<template>
    <span>
        <template v-if="vuDocLink">
            <a :href="vuDocLink" rel="noopener" target="_blank">{{ vuType }}</a>
        </template>
        <template v-else>{{ vuType }}</template><template v-if="field.isArray()">[]</template>
    </span>
</template>

<script lang="ts">
import Vue, {PropType} from 'vue';

import types from '../../data/types.json';
import Field from '../ebx/Field';
import {typeNameMappings} from '../ebx/types';

export default Vue.extend({
    name: 'TypeDocumentationLink',
    props: {
        field: {
            type: Object as PropType<Field<any>>,
            required: true,
        },
    },
    computed: {
        vuType(): string {
            return typeNameMappings[this.field.type] || this.field.type;
        },
        vuDocLink(): string | null {
            const source = (types.types as { [type: string]: string })[this.vuType];
            if (!source) {
                return null;
            }

            return (types.links as { [source: string]: string })[source].replace('%s', this.field.type.toLowerCase());
        },
    },
});
</script>
