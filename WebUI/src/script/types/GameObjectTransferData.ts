import { LogError } from '@/script/modules/Logger';
import { CtrRef } from '@/script/types/CtrRef';
import { GameObjectParentData } from '@/script/types/GameObjectParentData';
import { GameEntityData } from '@/script/types/GameEntityData';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Guid } from 'guid-typescript';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';

export class GameObjectTransferData {
	public guid: any;
	public typeName: string | string;
	public name: any;
	public parentData: GameObjectParentData | any;
	public blueprintCtrRef: CtrRef;
	public transform: any;
	public variation: number;
	public gameEntities: GameEntityData[];
	public isDeleted: boolean;
	public isEnabled: boolean;

	constructor(args: any = {}) {
		if (Object.keys(args).length !== 0 && args.guid === undefined) {
			LogError('Attempted to create a GameObjectTransferData without a specified GUID');
		}

		this.guid = args.guid;
		this.name = args.name; // for debugging only
		this.typeName = args.typeName;
		this.parentData = args.parentData;
		this.blueprintCtrRef = args.blueprintCtrRef;
		this.transform = args.transform;
		this.variation = args.variation;
		this.gameEntities = args.gameEntities;
		this.isDeleted = args.isDeleted;
		this.isEnabled = args.isEnabled;
	}

	public setFromTable(table: any) {
		const scope = this;
		if (table.guid === undefined) {
			LogError('Attempted to create a GameObjectTransferData without a specified GUID');
		}
		Object.keys(table).forEach((key) => {
			let value = table[key];

			switch (key) {
			case 'guid':
				value = Guid.parse(value);
				scope[key] = value;
				break;
			case 'blueprintCtrRef':
				value = new CtrRef().setFromTable(value);
				scope[key] = value;
				break;
			case 'transform':
				value = new LinearTransform().setFromTable(value);
				scope[key] = value;

				break;
			case 'parentData':
				value = GameObjectParentData.FromTable(table.parentData);
				scope[key] = value;

				break;
			case 'gameEntities': {
				const gameEntities: GameEntityData[] = [];
				Object.keys(value).forEach((index) => {
					const gameEntityDataTable = value[index];
					let transform = gameEntityDataTable.transform;
					if (transform !== undefined) {
						transform = new LinearTransform().setFromTable(gameEntityDataTable.transform);
					}
					let AABB = gameEntityDataTable.aabb;
					if (AABB !== undefined) {
						AABB = AxisAlignedBoundingBox.FromTable(AABB);
					}
					gameEntities.push(new GameEntityData(gameEntityDataTable.instanceId,
						gameEntityDataTable.indexInBlueprint,
						gameEntityDataTable.typeName,
						gameEntityDataTable.isSpatial,
						transform,
						AABB));
				});

				value = gameEntities;
				scope[key] = value;
				break;
			}
			case 'typeName':
			case 'name':
				scope[key] = value as string;
				break;
			case 'variation':
				scope[key] = value as number;
				break;
			default:
				// Sue me
				console.log('Unhandled: ' + key);
				(scope as any)[key] = value;
				break;
			}
		});

		return this;
	}
}
