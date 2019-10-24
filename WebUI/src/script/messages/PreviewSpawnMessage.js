export class PreviewSpawnMessage {
	constructor(gameObjectTransferData) {
		this.type = "PreviewSpawnMessage";

		if (gameObjectTransferData === undefined) {
			window.Log(LOGLEVEL.DEBUG, "PreviewSpawnMessage: Missing gameObjectTransferData");
			return;
		}

		this.gameObjectTransferData = gameObjectTransferData;
	}
}
