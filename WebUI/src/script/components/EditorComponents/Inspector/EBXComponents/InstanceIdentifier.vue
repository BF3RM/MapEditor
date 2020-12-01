<template>
    <span>
		<span v-for="(value, field) in instance.fields" v-bind:key="field">
			<span :key="field">
				{{field}}:
				<template v-if="value.type === 'String'">
					{{ instance.fields[field].value }}
				</template>
				<template v-else-if="value.type === 'SByte'">
					{{ instance.fields[field].value }}
				</template>
				<template v-else-if="value.type === 'Boolean'">
					{{ instance.fields[field].value }}
				</template>
				<template v-else-if="value.type === 'UInt32'">
					{{ instance.fields[field].value }}
				</template>
				<template v-else-if="value.type === 'UInt16'">
					{{ instance.fields[field].value }}
				</template>
				<template v-else-if="value.type === 'Vec3'">
					{{ instance.fields[field].value }}
				</template>
				<template v-else-if="value.type === 'LinearTransform'">
					<LinearTransformControl :value="instance.fields[field].value"></LinearTransformControl>
				</template>
				<template v-else-if="value.partitionGuid && value.instanceGuid">
					<reference-component :currentPath="currentPath" v-if="instance.fields[field].value && instance.fields[field].value.partitionGuid" :reference="instance.fields[field].value" :link="referenceLinks"></reference-component>
				</template>
				<template v-else>
					--------{{value.type}}
				</template>
				<br>
			</span>
		</span>

    </span>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import events from '../../../../../data/eventHashes.json';

import Instance from '../../../../types/ebx/Instance';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';

export default Vue.extend({
	name: 'InstanceIdentifier',
	props: {
		instance: {
			type: Object as PropType<Instance>,
			required: true
		},
		referenceLinks: {
			type: Boolean,
			default: () => true
		},
		currentPath: {
			type: String,
			required: false
		}
	},
	methods: {
		resolveEvent(hash: string): string {
			return (events as { [hash: string]: string })[hash] || hash;
		}
	},
	components: {
		LinearTransformControl,
		'reference-component': () => import('./ReferenceComponent.vue')
	}
});
</script>
