import {LogError} from '@/script/modules/Logger';
import {CtrRef} from '@/script/types/CtrRef';
import {GameObjectParentData} from '@/script/types/GameObjectParentData';
import {GameEntityData} from '@/script/types/GameEntityData';
import {LinearTransform} from '@/script/types/primitives/LinearTransform';
import {Guid} from 'guid-typescript';
import {AABB} from '@/script/types/AABB';

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
		if (Object.keys(args).length !== 0 &&  args.guid === undefined) {
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
		Object.keys(table).forEach(function(key) {
			let value = table[key];

			switch (key) {
				case 'blueprintCtrRef':
					value = new CtrRef().setFromTable(value);
					scope[key] = value;
					break;
				case 'transform':
					value = new LinearTransform().setFromTable(value);
					scope[key] = value;

					break;
				case 'parentData':
					value = new GameObjectParentData(table.guid, table.typeName, Guid.parse(table.primaryInstanceGuid), Guid.parse(table.partitionGuid));
					scope[key] = value;

					break;
				case 'gameEntities':
					const gameEntities: GameEntityData[] = [];
					Object.keys(value).forEach(function(index) {
						const gameEntityDataTable = value[index];
						gameEntities.push(new GameEntityData(gameEntityDataTable.instanceId,
							gameEntityDataTable.indexInBlueprint,
							gameEntityDataTable.typeName,
							gameEntityDataTable.isSpatial,
							new LinearTransform().setFromTable(gameEntityDataTable.transform),
						new AABB(gameEntityDataTable.aabb.min, gameEntityDataTable.aabb.max, gameEntityDataTable.aabb.transform)));
					});

					value = gameEntities;
				default:
					break;
			}
		});

		return this;
	}
}
