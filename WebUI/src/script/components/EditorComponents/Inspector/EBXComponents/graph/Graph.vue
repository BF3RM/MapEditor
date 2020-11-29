<template>
    <div class="graph" :id="elementId">
        <div class="m-1">
            <button class="button" @click="layout">Arrange</button>
        </div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Rete, { Input, Node, NodeEditor, Output, Socket } from 'rete';
// Let's just say Rete's packaging is a mess and we're saving us a whole lot of trouble by doing this
// @ts-ignore
import ConnectionPlugin from '../../../lib/rete/connection-plugin.common';
// @ts-ignore
import VueRenderPlugin from '../../../lib/rete/vue-render-plugin.common';

import cytoscape from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';
// @ts-ignore
import klay from 'cytoscape-klay';

import Partition from '../../ebx/Partition';

import InstanceComponent from './InstanceComponent';

import events from '../../../data/eventHashes.json';
import Field from '../../ebx/Field';
import Instance from '../../ebx/Instance';
import GameRegistry from '../../GameRegistry';
import Reference from '../../ebx/Reference';

export default Vue.extend({
	name: 'Graph',
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		registry: {
			type: Object as PropType<GameRegistry>,
			required: true
		}
	},
	data(): {
        visible: boolean;
        cy: cytoscape.Core | null;
        editor: NodeEditor | null;
        sockets: { [name: string]: Socket },
        instanceNodes: { [guid: string]: Node; },
        instanceInputs: { [guid: string]: { [key: string]: Input }; },
        instanceOutputs: { [guid: string]: { [key: string]: Output }; },
        connections: Array<{ output: Output, input: Input }>,
        } {
		return {
			visible: true,
			cy: null,
			editor: null,
			sockets: {
				event: new Socket('event'),
				link: new Socket('link'),
				property: new Socket('property')
			},
			instanceNodes: {},
			instanceInputs: {},
			instanceOutputs: {},
			connections: []
		};
	},
	computed: {
		elementId() {
			return `graph-${this.partition.guid}`;
		}
	},
	async mounted() {
		const editorElement = document.getElementById(this.elementId);
		if (!editorElement) {
			throw new Error(`Failed to find editor element with ID '${this.elementId}'`);
		}

		cytoscape.use(dagre);
		cytoscape.use(klay);

		this.cy = cytoscape({
			headless: true
		});

		const editor = new Rete.NodeEditor('ebx-graph-viewer@1.0.0', editorElement);
		this.editor = editor;

		editor.use(ConnectionPlugin);
		editor.use(VueRenderPlugin);

		// Do not allow modification of connections
		// @ts-ignore
		editor.on('connectionpick', () => false);

		editor.register(new InstanceComponent({ partition: this.partition }));

		for (const instance of Object.values(this.partition.instances)) {
			if (instance.fields.descriptor && instance.fields.descriptor.value) {
				try {
					await this.createInterfaceDescriptor(instance.fields.descriptor.value);
				} catch (err) {
					console.warn('Failed to create interface descriptor', err);
				}
			}

			if (instance.fields.eventConnections) {
				for (const eventConnection of instance.fields.eventConnections.value) {
					try {
						if (!eventConnection.value.source.value || !eventConnection.value.target.value) {
							console.warn('Event connection without target or source', eventConnection);
							continue;
						}
						await this.createEventConnection(eventConnection);
					} catch (err) {
						console.warn('Failed to create event connection', err);
					}
				}
			}
			if (instance.fields.propertyConnections) {
				for (const propertyConnection of instance.fields.propertyConnections.value) {
					try {
						if (!propertyConnection.value.source.value || !propertyConnection.value.target.value) {
							console.warn('Property connection without target or source', propertyConnection);
							continue;
						}
						await this.createPropertyConnection(propertyConnection);
					} catch (err) {
						console.warn('Failed to create property connection', err);
					}
				}
			}
			if (instance.fields.linkConnections) {
				for (const linkConnection of instance.fields.linkConnections.value) {
					try {
						if (!linkConnection.value.source.value || !linkConnection.value.target.value) {
							console.warn('Link connection without target or source', linkConnection);
							continue;
						}
						await this.createLinkConnection(linkConnection);
					} catch (err) {
						console.warn('Failed to create link connection', err);
					}
				}
			}
		}

		if (this.partition.primaryInstance) {
			const node = this.instanceNodes[this.partition.primaryInstance.guid];
			if (node) {
				editor.selectNode(node);
			} else if (editor.nodes.length) {
				editor.selectNode(editor.nodes[0]);
			}
		}

		this.$emit('nodes-changed', editor.nodes);
	},
	methods: {
		layout() {
			if (!this.editor || !this.cy) {
				throw new Error('Cannot update layout without editor or cytoscape core');
			}

			const self = this;
			const cy = this.cy;
			const editor = this.editor;

			console.log('Calculating node layout...');
			cy.layout({
				// name: 'dagre',
				name: 'klay',
				animate: false,
				fit: false,
				// @ts-ignore added by cytoscape-klay
				transform(node: cytoscape.NodeSingular, pos: cytoscape.Position) {
					return { x: pos.x * 10, y: pos.y * 5 };
				},

				// dagre
				rankDir: 'LR',
				ranker: 'longest-path',
				padding: 50,
				spacingFactor: 1.5,

				klay: {
					direction: 'RIGHT',
					edgeRouting: 'ORTHOGONAL',
					compactComponents: true,
					inLayerSpacingFactor: 2,
					layoutHierarchy: true,
					routeSelfLoopInside: true
					// thoroughness: 50,
				},

				stop() {
					console.log('Applying node layout...');
					cy.nodes().forEach((element: cytoscape.NodeSingular) => {
						const node = self.instanceNodes[element.id()];
						const pos = element.position();

						editor.view.nodes.get(node)?.translate(pos.x, pos.y);
						editor.view.updateConnections({ node });
					});
					console.log('Layout updated');
				}
			}).run();
		},

		createNode(instance: Instance): Node {
			if (!this.editor || !this.cy) {
				throw new Error('Cannot create nodes without editor or cytoscape core');
			}

			const node = new Node('instance');
			node.data.instance = instance;
			node.data.sourcePartition = this.partition;
			node.data.registry = this.registry;
			this.instanceNodes[instance.guid] = node;
			this.instanceInputs[instance.guid] = {};
			this.instanceOutputs[instance.guid] = {};
			this.editor.addNode(node);

			this.cy.add({ group: 'nodes', data: { id: instance.guid, label: instance.type } });

			return node;
		},

		async resolveInstance(reference: Reference): Promise<Instance> {
			const partition = await this.registry.resolve(reference.partitionGuid);
			const instance = partition.instances[reference.instanceGuid];
			if (!instance) {
				throw new Error(`Failed to find instance ${reference.instanceGuid} in partition ${reference.partitionGuid}`);
			}

			return instance;
		},

		prepareNode(instance: Instance): Node {
			const node = this.instanceNodes[instance.guid];
			if (node) {
				return node;
			}

			return this.createNode(instance);
		},

		prepareOutput(node: Node, key: string, title: string, socket: Socket): Output {
			const instance = node.data.instance as Instance;
			let output = this.instanceOutputs[instance.guid][key];
			if (!output) {
				output = new Rete.Output(key, title, socket, true);
				this.instanceOutputs[instance.guid][key] = output;
				node.addOutput(output);
			}

			return output;
		},

		prepareInput(node: Node, key: string, title: string, socket: Socket): Input {
			const instance = node.data.instance as Instance;
			let input = this.instanceInputs[instance.guid][key];
			if (!input) {
				input = new Rete.Input(key, title, socket, true);
				this.instanceInputs[instance.guid][key] = input;
				node.addInput(input);
			}

			return input;
		},

		connect(output: Output, input: Input): void {
			setTimeout(() => {
				if (!this.editor || !this.cy) {
					throw new Error('Cannot connect nodes without editor or cytoscape core');
				}

				this.editor.connect(output, input);
				this.cy.add({
					group: 'edges',
					data: {
						id: `${output.key}-to-${input.key}`,
						source: (output.node?.data.instance as Instance).guid,
						target: (input.node?.data.instance as Instance).guid
					}
				});
			}, 0);
		},

		async createInterfaceDescriptor(reference: Reference): Promise<void> {
			const instance = await this.resolveInstance(reference);
			if (instance.type !== 'InterfaceDescriptorData') {
				throw new Error(`Invalid interface descriptor type '${instance.type}'`);
			}

			// TODO Split into two nodes (input/output)
			const node = this.prepareNode(instance);

			for (const inputEvent of instance.fields.inputEvents.value) {
				const eventId = inputEvent.value.id.value;
				const key = `event-input-${instance.guid}-${eventId}`;
				this.prepareInput(node, key, `${this.resolveHash(eventId)}`, this.sockets.event);
			}

			for (const outputEvent of instance.fields.outputEvents.value) {
				const eventId = outputEvent.value.id.value;
				const key = `event-output-${instance.guid}-${eventId}`;
				this.prepareOutput(node, key, `${this.resolveHash(eventId)}`, this.sockets.event);
			}

			for (const inputLink of instance.fields.inputLinks.value) {
				const fieldId = inputLink.value.id.value;
				const key = `link-input-${instance.guid}-${fieldId}`;
				this.prepareInput(node, key, `${this.resolveHash(fieldId)}`, this.sockets.link);
			}

			for (const outputLink of instance.fields.outputLinks.value) {
				const fieldId = outputLink.value.id.value;
				const key = `link-output-${instance.guid}-${fieldId}`;
				this.prepareOutput(node, key, `${this.resolveHash(fieldId)}`, this.sockets.link);
			}

			for (const field of instance.fields.fields.value) {
				const fieldId = field.value.id.value;
				const sourceAndTarget = field.value.accessType.enumValue === 'FieldAccessType_SourceAndTarget';
				const source = field.value.accessType.enumValue === 'FieldAccessType_Source' || sourceAndTarget;
				const target = field.value.accessType.enumValue === 'FieldAccessType_Target' || sourceAndTarget;
				if (target) {
					this.prepareOutput(node, `property-output-${instance.guid}-${fieldId}`, `${this.resolveHash(fieldId)}`, this.sockets.property);
				}
				if (source) {
					this.prepareInput(node, `property-input-${instance.guid}-${fieldId}`, `${this.resolveHash(fieldId)}`, this.sockets.property);
				}
				if (!source && !target) {
					console.warn('Unhandled interface descriptor field', field.value);
				}
			}
		},

		async createEventConnection(eventConnection: Field<any>): Promise<void> {
			const sourceInstance = await this.resolveInstance(eventConnection.value.source.value);
			const sourceNode = this.prepareNode(sourceInstance);
			const sourceEvent = eventConnection.value.sourceEvent.value.id.value;
			const sourceKey = `event-output-${sourceInstance.guid}-${sourceEvent}`;
			const output = this.prepareOutput(sourceNode, sourceKey, `${this.resolveHash(sourceEvent)}`, this.sockets.event);

			const targetInstance = await this.resolveInstance(eventConnection.value.target.value);
			const targetNode = this.prepareNode(targetInstance);
			const targetEvent = eventConnection.value.targetEvent.value.id.value;
			const targetKey = `event-input-${targetInstance.guid}-${targetEvent}`;
			const input = this.prepareInput(targetNode, targetKey, `${this.resolveHash(targetEvent)}`, this.sockets.event);

			this.connect(output, input);
		},

		async createPropertyConnection(propertyConnection: Field<any>): Promise<void> {
			const sourceInstance = await this.resolveInstance(propertyConnection.value.source.value);
			const sourceNode = this.prepareNode(sourceInstance);
			const sourceField = propertyConnection.value.sourceFieldId.value;
			const sourceKey = `property-output-${sourceInstance.guid}-${sourceField}`;
			const output = this.prepareOutput(sourceNode, sourceKey, `${this.resolveHash(sourceField)}`, this.sockets.property);

			const targetInstance = await this.resolveInstance(propertyConnection.value.target.value);
			const targetNode = this.prepareNode(targetInstance);
			const targetField = propertyConnection.value.targetFieldId.value;
			const targetKey = `property-input-${targetInstance.guid}-${targetField}`;
			const input = this.prepareInput(targetNode, targetKey, `${this.resolveHash(targetField)}`, this.sockets.property);

			this.connect(output, input);
		},

		async createLinkConnection(linkConnection: Field<any>): Promise<void> {
			const sourceInstance = await this.resolveInstance(linkConnection.value.source.value);
			const sourceNode = this.prepareNode(sourceInstance);
			const sourceField = linkConnection.value.sourceFieldId.value;
			const sourceKey = `link-input-${sourceInstance.guid}-${sourceField}`;
			const input = this.prepareInput(sourceNode, sourceKey, `${this.resolveHash(sourceField)}`, this.sockets.link);

			const targetInstance = await this.resolveInstance(linkConnection.value.target.value);
			const targetNode = this.prepareNode(targetInstance);
			const targetField = linkConnection.value.targetFieldId.value;
			const targetKey = `link-output-${targetInstance.guid}-${targetField}`;
			const output = this.prepareOutput(targetNode, targetKey, `${this.resolveHash(targetField)}`, this.sockets.link);

			this.connect(output, input);
		},

		resolveHash(hash: string): string {
			return (events as { [hash: string]: string; })[hash] || hash;
		}

	}
});
</script>

<style lang="scss">

$connection-color: #131313;
$connection-event-color: #940000;
$connection-property-color: #004c88;
$connection-link-color: #ffc62f;

.graph {
  width: 100%;
  height: 100%;

  background-color: #7A7A7A;

  .connection {
    .main-path {
      stroke: $connection-color;
    }

    &.socket-input-event, &.socket-output-event {
      .main-path {
        stroke: $connection-event-color;
      }
    }

    &.socket-input-property, &.socket-output-property {
      .main-path {
        stroke: $connection-property-color;
      }
    }

    &.socket-input-link, &.socket-output-link {
      .main-path {
        stroke: $connection-link-color;
      }
    }
  }

}

</style>
