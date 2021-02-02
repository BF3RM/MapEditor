import { TransferData } from '@/script/types/TransferData';

export class CommandActionResult {
	public type: string;
	public sender: string;
	public gameObjectTransferData: TransferData;

	constructor(type: string, name: string, gameObjectTransferData: TransferData) {
		this.type = type;
		this.sender = name;
		this.gameObjectTransferData = gameObjectTransferData;
	}

	public static FromObject(table: any) {
		const type = table.type;
		const sender = table.sender;
		const gameObjectTransferData = TransferData.FromTable(table.gameObjectTransferData);

		return new CommandActionResult(type, sender, gameObjectTransferData);
	}
}
