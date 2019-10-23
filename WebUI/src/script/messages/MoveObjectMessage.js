export class MoveObjectMessage {
	constructor(gameObjectTransferData) {
		this.type = "MoveObjectMessage";

		if (gameObjectTransferData === undefined) {
			Log(LOGLEVEL.DEBUG, "MoveObjectMessage: Missing gameObjectTransferData");
			return;
		}

		this.gameObjectTransferData = gameObjectTransferData;
	}
}