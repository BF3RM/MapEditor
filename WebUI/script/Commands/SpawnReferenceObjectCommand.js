const SpawnReferenceObjectCommand = function (guid, parameters, transform) {

	Command.call(this);

	this.type = 'SpawnReferenceObjectCommand';
	this.name = 'Spawn ReferenceObject';
	this.guid = guid;

	if (parameters === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Missing spawn parameters");
		return;
	}
	this.parameters = parameters;
	this.transform = transform;
};


SpawnReferenceObjectCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.parameters, this.transform))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "DestroyReferenceObjectCommand"))
	},
};

