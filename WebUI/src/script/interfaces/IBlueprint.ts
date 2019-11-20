import { Guid } from 'guid-typescript';

export interface IBlueprint {
	partitionGuid: Guid | string;
	instanceGuid: Guid | string;
	typeName: string;
	name: string;
	variations: any;
	favorited?: boolean;
}
