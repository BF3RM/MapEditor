const SpawnBlueprintCommand = function (guid, parameters) {

	Command.call(this);

	this.type = 'SpawnBlueprintCommand';
	this.name = 'Spawn Blueprint: ' + parameters.name;
	this.guid = guid;

	if (parameters === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Missing spawn parameters");
		return;
	}
	this.parameters = parameters;
};


SpawnBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.parameters))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "DestroyBlueprintCommand", this.parameters))
	},
};

