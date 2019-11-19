import { Guid } from 'guid-typescript';
import { CtrRef } from '@/script/types/CtrRef';
import { LogError } from '@/script/modules/Logger';

export class Blueprint {
	public partitionGuid: Guid;
	public instanceGuid: Guid;
	public typeName: string;
	public name: string;
	private variations: any;
	private favorited = false;

	constructor(partitionGuid: Guid, instanceGuid: Guid, typeName: string, name: string, variations: any) {
		this.partitionGuid = partitionGuid;
		this.instanceGuid = instanceGuid;
		this.typeName = typeName;
		this.name = name;
		this.variations = variations;
	}

	public getDefaultVariation() {
		const scope = this;
		if (scope.hasVariation()) {
			return this.variations[0].hash;
		} else {
			return 0;
		}
	}

	public SetFavorite(favStatus: boolean) {
		this.favorited = favStatus;
	}

	public hasVariation() {
		return !(Object.keys(this.variations).length === 0);
	}

	public isVariationValid(variation: number) {
		const scope = this;
		return (scope.hasVariation() /* && scope.getVariation(variation) !== undefined */);
		// Always returns 0
	}

	public getVariation(hash: string) {
		const scope = this;
		return scope.variations[hash];
		// tsk tsk tsk
	}

	public fromObject(object: any) {
		if (object.partitionGuid === null || object.instanceGuid === null || object.name === null) {
			LogError('Failed to register blueprint from object: ' + object);
		} else {
			this.partitionGuid = object.partitionGuid;
			this.instanceGuid = object.instanceGuid;
			this.typeName = object.typeName;
			this.name = object.name;
			this.variations = object.variations;
			return this;
		}
	}

	public getCtrRef() {
		const scope = this;
		return new CtrRef(scope.typeName, scope.name, scope.partitionGuid, scope.instanceGuid);
	}

	// Changes Some/Path/BlueprintName into just BlueprintName
	public getName() {
		return this.name.substring(this.name.lastIndexOf('/') + 1);
	}
}
