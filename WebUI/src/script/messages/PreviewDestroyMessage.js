export class PreviewDestroyMessage {
	constructor(gameObjectTransferData) {
		this.type = "PreviewDestroyMessage";

		if (gameObjectTransferData === undefined) {
			Log(LOGLEVEL.DEBUG, "PreviewDestroyMessage: Missing gameObjectTransferData");
			return;
		}

		this.gameObjectTransferData = gameObjectTransferData;
	}
}

