<template>
    <span>
        <template v-if="instance.fields.name">
            {{ instance.fields.name.value }}
        </template>
        <template v-else-if="instance.fields.nameHash">
            {{ resolveEvent(instance.fields.nameHash.value) }}
        </template>
        <template v-else-if="instance.fields.resourceName">
            {{ instance.fields.resourceName.value }}
        </template>
        <template v-else-if="instance.fields.instanceName">
            {{ instance.fields.instanceName.value }}
        </template>
        <template v-else-if="instance.fields.bundleName">
            {{ instance.fields.bundleName.value }}
        </template>

        <template v-if="instance.fields.blueprint && instance.fields.blueprint.value">
            <reference-component :reference="instance.fields.blueprint.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.physicsBlueprint && instance.fields.physicsBlueprint.value">
            <reference-component :reference="instance.fields.physicsBlueprint.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.mesh && instance.fields.mesh.value">
            <reference-component :reference="instance.fields.mesh.value" :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.effect && instance.fields.effect.value">
            <reference-component :reference="instance.fields.effect.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.camera && instance.fields.camera.value">
            <reference-component :reference="instance.fields.camera.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.emitter && instance.fields.emitter.value">
            <reference-component :reference="instance.fields.emitter.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.sound && instance.fields.sound.value">
            <reference-component :reference="instance.fields.sound.value" :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.wave && instance.fields.wave.value">
            <reference-component :reference="instance.fields.wave.value" :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.unlockAsset && instance.fields.unlockAsset.value">
            <reference-component :reference="instance.fields.unlockAsset.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.visualEnvironment && instance.fields.visualEnvironment.value">
            <reference-component :reference="instance.fields.visualEnvironment.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.enlightenData && instance.fields.enlightenData.value">
            <reference-component :reference="instance.fields.enlightenData.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.asset && instance.fields.asset.value">
            <reference-component :reference="instance.fields.asset.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.shaderInstance && instance.fields.shaderInstance.value">
            <reference-component :reference="instance.fields.shaderInstance.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.shader && instance.fields.shader.value">
            <template v-if="instance.fields.shader.value.partitionGuid && instance.fields.shader.value.instanceGuid">
                <reference-component :reference="instance.fields.shader.value"
                           :link="referenceLinks"></reference-component>
            </template>
            <template v-else>
                <!-- SurfaceShaderInstanceDataStruct is nested -->
                <reference-component :reference="instance.fields.shader.value.shader.value"
                           :link="referenceLinks"></reference-component>
            </template>
        </template>
        <template v-else-if="instance.fields.graphAsset && instance.fields.graphAsset.value">
            <reference-component :reference="instance.fields.graphAsset.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.voEvent && instance.fields.voEvent.value">
            <reference-component :reference="instance.fields.voEvent.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.customizeSoldierData && instance.fields.customizeSoldierData.value">
            <reference-component :reference="instance.fields.customizeSoldierData.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.event && instance.fields.event.value">
            <reference-component :reference="instance.fields.event.value" :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.skeletonAsset && instance.fields.skeletonAsset.value">
            <reference-component :reference="instance.fields.skeletonAsset.value"
                       :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.mixer && instance.fields.mixer.value">
            <reference-component :reference="instance.fields.mixer.value" :link="referenceLinks"></reference-component>
        </template>
        <template v-else-if="instance.fields.impulseResponse && instance.fields.impulseResponse.value">
            <reference-component :reference="instance.fields.impulseResponse.value"
                       :link="referenceLinks"></reference-component>
        </template>

        <template v-if="instance.fields.team && typeof instance.fields.team.value !== 'object'">
            ({{ instance.fields.team.enumValue || instance.fields.team.value }})
        </template>
        <template v-else-if="instance.fields.teamId">
            ({{ instance.fields.teamId.enumValue || instance.fields.teamId.value }})
        </template>
        <template v-else-if="instance.fields.id">
            ({{ instance.fields.id.enumValue || instance.fields.id.value }})
        </template>
        <template v-else-if="instance.fields.rigidBodyType">
            ({{ instance.fields.rigidBodyType.enumValue || instance.fields.rigidBodyType.value }})
        </template>
        <template v-else-if="instance.fields.poseType">
            ({{ instance.fields.poseType.enumValue || instance.fields.poseType.value }})
        </template>
        <template v-else-if="instance.fields.text">
            {{ instance.fields.text.value }}
        </template>
        <template v-else-if="instance.fields.sid">
            {{ instance.fields.sid.value }}
        </template>
        <template v-else-if="instance.fields.damageGiverName">
            {{ instance.fields.damageGiverName.value }}
        </template>
        <template v-else-if="instance.fields.messageSid">
            {{ instance.fields.messageSid.value }}
        </template>
        <template v-else-if="instance.fields.boneName">
            {{ instance.fields.boneName.value }}
        </template>
        <template v-else-if="instance.fields.emote">
            ({{ instance.fields.emote.enumValue || instance.fields.emote.value }})
        </template>
    </span>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import events from '../../../../../data/eventHashes.json';

import Instance from '../../../../types/ebx/Instance';

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
		}
	},
	methods: {
		resolveEvent(hash: string): string {
			return (events as { [hash: string]: string })[hash] || hash;
		}
	},
	components: {
		'reference-component': () => import('./ReferenceComponent.vue')
	}
});
</script>
