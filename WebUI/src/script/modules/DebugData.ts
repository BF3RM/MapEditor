import { Guid } from 'guid-typescript';

const names = ['Weapons', 'Vehicles', 'Foo', 'Bar', 'Powback', 'This', 'Is', 'Trash', 'OK', 'Thanks', 'To', 'Mum', 'For', 'Believing', 'In', 'Me'];

function GenerateRandomName() {
	let out = '';
	for (let i = 0; i < 3; i++) {
		out += names[Math.floor(Math.random() * names.length)] + '/';
	}
	return out;
}

export function GenerateBlueprints(count: number) {
	const out = [];
	for (let i = 0; i < count; i++) {
		out.push({
			typeName: 'VisualEnvironmentBlueprint',
			name: GenerateRandomName(),
			partitionGuid: Guid.create().toString(),
			instanceGuid: Guid.create().toString(),
			variations: [
				{
					hash: Math.random(),
					name: Math.random()
				}, {
					hash: Math.random(),
					name: Math.random()
				}, {
					hash: Math.random(),
					name: Math.random()
				}, {
					hash: Math.random(),
					name: Math.random()
				}
			]
		});
	}
	return out;
}
