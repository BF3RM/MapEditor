import { TransferData } from '@/script/types/TransferData';

export class VextCommand {
	public sender: string;

	constructor(public type: string, public gameObjectTransferData: TransferData) {
		this.type = type;
		this.sender = '';
		// The TransferData can be incomplete, it gets merged with existing data on lua side
		// Only send the minimal info required by the CommandActions
		this.gameObjectTransferData = gameObjectTransferData;
	}
}
