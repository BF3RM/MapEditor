const PreviewSpawnMessage = function (userData) {
	this.guid = "ed170120-0000-0000-0000-000000000000";
	this.type = 'PreviewSpawnMessage';

	if (userData === undefined) {
		Log(LOGLEVEL.DEBUG, "Missing spawn gameObjectTransferData");
		return;
	}
	this.userData = userData;
};
