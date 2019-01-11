const SpawnBlueprintCommand = function (guid, userData) {

	Command.call(this);

	this.type = 'SpawnBlueprintCommand';
	this.name = 'Spawn Blueprint: ' + userData.name;
	this.guid = guid;

	if (userData === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Missing spawn userData");
		return;
	}
	this.userData = userData;
};


SpawnBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.userData))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "DestroyBlueprintCommand"))
	},
};

