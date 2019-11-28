import { Guid } from '@/script/types/Guid';

export interface IBlueprint {
	partitionGuid: Guid | string;
	instanceGuid: Guid | string;
	typeName: string;
	name: string;
	variations: any;
	favorited?: boolean;
}
