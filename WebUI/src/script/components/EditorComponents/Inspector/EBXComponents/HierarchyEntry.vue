<template>
    <div class="hierarchy-entry">
        <router-link :to="`#${instance.guid}`">
            {{ instance.type }}
        </router-link>
        <instance-identifier :instance="instance"></instance-identifier>
        <ul v-if="childInstances.length">
            <li v-for="instance in childInstances" :key="instance.guid">
                <hierarchy-entry :instance="instance"></hierarchy-entry>
            </li>
        </ul>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Instance from '../../../../types/ebx/Instance';
import Partition from '../../../../types/ebx/Partition';
import Reference from '../../../../types/ebx/Reference';
import InstanceIdentifier from '@/script/components/EditorComponents/Inspector/EBXComponents/InstanceIdentifier.vue';

const referenceFields = [
	'object',
	'objects',
	'data',
	'components',
	'nodes',
	'groups',
	'descriptor',
	// Misc
	'healthStates',
	'partLinks',
	'spawnedBangerBlueprint',
	'playerView',
	'subViews',
	'cameras',
	'unlockValues',
	'weaponFiring',
	'cameraRecoil',
	'suppressionData',
	'networkedMessageMappings',
	// Animation sockets
	'gameplaySockets',
	'rigidVisualSockets',
	'skinnedVisualSockets',
	// Physics
	'physicsData',
	'scaledAssets',
	'rigidBodies',
	'floatPhysics',
	'constraints',
	'skeletonCollisionData',
	'materials',
	'customizedMaterials',
	'poses',
	'states',
	'sprint',
	// Emitters
	'pre',
	'rootProcessor',
	'nextProcessor',
	'templateData',
	// Sounds
	'outputNodes',
	'graph',
	'system',
	'conditions',
	'inputs',
	'variations',
	'events',
	'defaultStartEvent',
	'defaultStopEvent',
	'defaultEnterScopeEvent',
	'defaultForceInitEvent',
	'flows',
	// Camera
	'weaponSpringEffect',
	'cameraSpringEffect'
];

export default Vue.extend({
	name: 'HierarchyEntry',
	props: {
		instance: {
			type: Object as PropType<Instance>,
			required: true
		}
	},
	components: {
		InstanceIdentifier
	},
	data(): { childInstances: Array<Instance> } {
		return {
			childInstances: []
		};
	},
	async mounted() {
		const references: Array<Reference> = [];

		for (const fieldName of referenceFields) {
			const field = this.instance.fields[fieldName];
			if (field) {
				if (Array.isArray(field.value)) {
					references.push(...field.value.map(f => f.value).filter(f => f));
				} else if (field.value) {
					references.push(field.value);
				}
			}
		}

		const validReferences = references.filter(ref => ref && ref.partitionGuid && ref.instanceGuid);

		// TODO Remove duplicate references

		const partitionGuids = [...new Set(validReferences.map(ref => ref.partitionGuid))];
		const partitions: { [guid: string]: Partition } = {};
		(await Promise.all(partitionGuids.map(guid => this.registry.resolve(guid))))
			.filter(partition => partition)
			.forEach(partition => {
				partitions[partition.guid] = partition;
			});

		this.childInstances.push(...validReferences.map(reference => partitions[reference.partitionGuid.toString()].instances[reference.instanceGuid.toString()]));
	}
});
</script>
