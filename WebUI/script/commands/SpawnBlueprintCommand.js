const SpawnBlueprintCommand = function (gameObjectData) {

	Command.call(this);

	this.type = 'SpawnBlueprintCommand';
	this.name = 'Spawn Blueprint: ' + gameObjectData.name;

	if (gameObjectData === undefined) {
		Log(LOGLEVEL.DEBUG, "Missing spawn gameObjectData");
		return;
	}

	this.gameObjectData = gameObjectData.clone(); // sending the whole GameObjectData as a reference

	this.guid = gameObjectData.guid
};


SpawnBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.type, this.gameObjectData))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand("DestroyBlueprintCommand"))
	},
};

