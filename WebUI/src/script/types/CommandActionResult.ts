import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';

export class CommandActionResult {
	public type: string;
	public sender: string;
	public gameObjectTransferData: GameObjectTransferData;

	constructor(type: string, name: string, gameObjectTransferData: GameObjectTransferData) {
		this.type = type;
		this.sender = name;
		this.gameObjectTransferData = gameObjectTransferData;
	}

	public static FromObject(table: any) {
		const type = table.type;
		const sender = table.sender;
		const gameObjectTransferData = GameObjectTransferData.FromTable(table.gameObjectTransferData);

		return new CommandActionResult(type, sender, gameObjectTransferData);
	}
}
