<template>
    <div>
        <h4 :id="instance.guid">
            <!--<a :href="`https://docs.veniceunleashed.net/vext/ref/fb/${instance.type.toLowerCase()}/`">-->
                {{ instance.type }}
			<!--</a>
			{{ instance.guid }}-->
            <button class="button is-small" v-if="visible" @click="visible = false">Hide</button>
            <button class="button is-small" v-else @click="visible = true">Show</button>
        </h4>
        <div class="table-container" v-if="visible">
            <table class="table is-bordered">
                <tbody>
					<Property :currentPath="partition.name" v-for="(field, index) in instance.fields" :partition="partition" :field="field" :key="index"></Property>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Instance from '../../../../types/ebx/Instance';
import Property from './Property.vue';

export default Vue.extend({
	name: 'Instance',
	components: {
		Property
	},
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		instance: {
			type: Object as PropType<Instance>,
			required: true
		},
		active: String
	},
	data() {
		return {
			visible: true
		};
	},
	mounted() {
		if (location.hash && location.hash.substring(1) === this.instance.guid) {
			this.visible = true;
		}
		console.log(this.$props.partition.name);
	},
	watch: {
		active(guid) {
			if (guid === this.instance.guid) {
				this.visible = true;
			}
		}
	},
	methods: {
		luaFindInstanceByGuid(partition: Partition, instance: Instance) {
			return `${instance.type}(ResourceManager:FindInstanceByGuid(Guid('${partition.guid}'), Guid('${instance.guid}')))`;
		},
		luaFindInstance(instance: Instance) {
			return `${instance.type}(partition:FindInstance(Guid('${instance.guid}')))`;
		}
	}
});
</script>

<style lang="scss" scoped>

input[type=text].input {
  max-width: 20%;
}

</style>
