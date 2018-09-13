const SpawnReferenceObjectCommand = function (reference, transform, variation) {

	Command.call(this);

	this.type = 'SpawnReferenceObjectCommand';
	this.name = 'Spawn ReferenceObject';

	if (reference === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Tried to spawn nothing");
		return;
	}
	this.parameters = {
		"reference": reference,
		"transform": transform,
		"variation": variation
	}
};


SpawnReferenceObjectCommand.prototype = {

	execute: function () {
		editor.vext.SendCommands(this.type, this.parameters)
	},

	undo: function () {

		editor.vext.SendCommands(this.type, this.parameters );
	},
};

