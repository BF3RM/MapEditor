import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';

export class CommandActionResult {
	public type: string;
	public sender: string;
	public gameObjectTransferData: any;

	constructor(type: string, name: string, payload: any) {
		this.type = type;
		this.sender = name;
		this.gameObjectTransferData = new GameObjectTransferData().setFromTable(payload);;
	}

	public setFromTable(table: any) {
		this.type = table.type;
		this.sender = table.sender;
		this.gameObjectTransferData = new GameObjectTransferData().setFromTable(table.gameObjectTransferData);

		return this;
	}
}
