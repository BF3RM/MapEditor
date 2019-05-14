const PreviewSpawnMessage = function (gameObjectTransferData) {
	this.guid = "ed170120-0000-0000-0000-000000000000";
	this.type = 'PreviewSpawnMessage';

	if (gameObjectTransferData === undefined) {
		Log(LOGLEVEL.DEBUG, "Missing spawn gameObjectTransferData");
		return;
	}
	this.gameObjectTransferData = gameObjectTransferData;
};
