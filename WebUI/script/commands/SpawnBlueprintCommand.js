const SpawnBlueprintCommand = function (guid, parameters) {

	Command.call(this);

	this.type = 'SpawnBlueprintCommand';
	this.name = 'Spawn Blueprint: ' + parameters.name;
	this.guid = guid;

	if (parameters === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Missing spawn userData");
		return;
	}
	this.parameters = JSON.parse(JSON.stringify(parameters));
};


SpawnBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.parameters))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "DestroyBlueprintCommand"))
	},
};

