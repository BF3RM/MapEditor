import {GameObjectTransferData} from "@/script/types/GameObjectTransferData";

export class VextCommand {
	public sender: string;
	constructor(public type: string, public gameObjectTransferData: GameObjectTransferData) {
		this.type = type;
		this.sender = '';
		// The GameObjectTransferData can be incomplete, it gets merged with existing data on lua side
		// Only send the minimal info required by the CommandActions
		this.gameObjectTransferData = gameObjectTransferData;
	}
}
