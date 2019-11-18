import { Guid } from 'guid-typescript';

export function GenerateBlueprints(count: number) {
	const out = [];
	for (let i = 0; i < count; i++) {
		out.push({
			typeName: 'VisualEnvironmentBlueprint',
			name: 'test/test',
			partitionGuid: Guid.create(),
			instanceGuid: Guid.create(),
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
