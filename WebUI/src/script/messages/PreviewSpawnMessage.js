export class PreviewSpawnMessage {
	constructor(gameObjectTransferData) {
		this.type = "PreviewSpawnMessage";

		if (gameObjectTransferData === undefined) {
			Log(LOGLEVEL.DEBUG, "PreviewSpawnMessage: Missing gameObjectTransferData");
			return;
		}

		this.gameObjectTransferData = gameObjectTransferData;
	}
}