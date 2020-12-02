<template>
    <div>
        <div class="is-family-code">
            <template v-if="eventId">
                {{ field.value }}: {{ eventId }}
            </template>
            <template v-else-if="interfaceId">
                {{ field.value }}: {{ interfaceId }}
            </template>
            <template v-else-if="field.isEnum()">
				<span class="has-text-grey">{{ field.type }}.</span><span class="enum">{{ field.enumValue }}</span>
            </template>
            <template v-else>
                {{ field.value }}
				{{field}}
            </template>
        </div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

export default Vue.extend({
	name: 'DefaultProperty',
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<any>>,
			required: true
		}
	},
	computed: {
		eventId(): string | undefined {
			if (!this.field.value) {
				return null;
			}

			return window.editor.fbdMan.eventHashes.getValue(this.field.value);
		},
		interfaceId(): string | undefined {
			if (!this.field.value) {
				return null;
			}

			return window.editor.fbdMan.InterfaceIDs.getValue(this.field.value);
		}
	}
});
</script>

<style lang="scss" scoped>
.enum {
	color: #ebff56;
}
</style>
