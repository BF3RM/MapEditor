<template>
    <div>
        <div v-if="partition">
            <h2 class="title">
                Partition {{ partition.guid }}
            </h2>
<!--
            <div v-show="graphVisible">
                <h3 class="subtitle">
                    Graph
                </h3>
                <div class="content graph">
                    <graph :partition="partition" @nodes-changed="graphNodesChanged"></graph>
                </div>
            </div>
!-->
            <h3 class="subtitle">
                Instances
            </h3>

            <ul class="content">
                <li v-for="instance in partition.instances" :key="instance.guid">
                    <InstanceProperty :key="instance.guid"
                              :partition="partition" :instance="instance"
                              :active="activeInstance"></InstanceProperty>
                </li>
            </ul>
        </div>
        <div v-else>
            Loading... {{path}}
        </div>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';

import Partition from '../../../../types/ebx/Partition';
import InstanceProperty from './InstanceProperty.vue';
// import Graph from './graph/Graph.vue';

export default Vue.extend({
	name: 'Partition',
	props: [
		'game',
		'path',
		'guid'
	],
	data(): {
        partition: Partition | undefined;
        activeInstance: string;
        types: { [type: string]: any };
        graphVisible: boolean;
        } {
		return {
			partition: undefined,
			activeInstance: '',
			types: {},
			graphVisible: false
		};
	},
	computed: {
		fileUrl(): string {
			return `/${this.game}/ebx/${this.path}.json`;
		},
		directoryUrl(): string {
			const parts = this.path.split('/');
			parts.pop();
			return `https://github.com/EmulatorNexus/Venice-EBX/tree/master/${parts.join('/')}`;
		}
	},
	mounted() {
		console.log('yo');
		this.partition = window.editor.fbdMan.getPartition(this.$props.path);
		console.log(this.$props.path);
		if (this.partition && Object.keys(this.partition.instances).length === 1 && this.activeInstance === '') {
			this.activeInstance = this.partition.instances[Object.keys(this.partition.instances)[0]].guid;
		}
	},
	watch: {
		$route(to) {
			if (to.hash) {
				this.activeInstance = to.hash.substring(1);
			} else {
				this.activeInstance = '';
			}
		},
		path(to) {
			console.log(to);
			this.partition = window.editor.fbdMan.getPartition(to);
		}
	},
	methods: {
		copyToClipboard(text: string) {
			navigator.clipboard.writeText(text);
		},
		graphNodesChanged(nodes: Array<any>): void {
			this.graphVisible = false; // nodes.length > 0;
		}
	},
	components: {
		InstanceProperty
		// Graph
	}
});
</script>

<style lang="scss" scoped>

.graph {
  width: 100%;
  min-height: 85vh;
}

</style>
