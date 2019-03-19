const SpawnBlueprintCommand = function (guid, userData) {

	Command.call(this);

	this.type = 'SpawnBlueprintCommand';
	this.name = 'Spawn Blueprint: ' + userData.name;
	this.guid = guid;

	if (userData === undefined) {
		Log(LOGLEVEL.DEBUG, "Missing spawn userData");
		return;
	}
	this.userData = userData.clone();
};


SpawnBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.userData))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "DestroyBlueprintCommand"))
	},
};

