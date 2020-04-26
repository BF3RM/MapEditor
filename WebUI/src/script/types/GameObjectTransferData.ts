import { LogError } from '@/script/modules/Logger';
import { CtrRef } from '@/script/types/CtrRef';
import { GameObjectParentData } from '@/script/types/GameObjectParentData';
import { GameEntityData } from '@/script/types/GameEntityData';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Guid } from '@/script/types/Guid';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';

export class GameObjectTransferData {
	public guid: any;
	public typeName: string;
	public name: any;
	public parentData: GameObjectParentData | any;
	public blueprintCtrRef: CtrRef;
	public transform: any;
	public variation: number;
	public gameEntities: GameEntityData[];
	public isDeleted: boolean;
	public isEnabled: boolean;
	public isVanilla: boolean;

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
		this.isVanilla = args.isVanilla;
	}

	public static FromTable(table: any) {
		if (table.guid === undefined) {
			LogError('Attempted to create a GameObjectTransferData without a specified GUID');
		}
		const gameEntities = [] as GameEntityData[];
		const args: any[string] = [];
		Object.keys(table).forEach((key) => {
			let value = table[key];

			switch (key) {
			case 'guid':
				value = Guid.parse(value);
				break;
			case 'blueprintCtrRef':
				value = new CtrRef().setFromTable(value);
				break;
			case 'transform':
				value = LinearTransform.setFromTable(value);
				break;
			case 'parentData':
				value = GameObjectParentData.FromTable(table.parentData);
				break;
			case 'gameEntities':
				Object.keys(value).forEach((index) => {
					const gameEntityDataTable = value[index];
					gameEntities.push(GameEntityData.FromTable(gameEntityDataTable));
				});
				value = gameEntities;
				break;
			default:
				break;
			}

			(args)[key] = value;
		});

		return new GameObjectTransferData(args);
	}
}
