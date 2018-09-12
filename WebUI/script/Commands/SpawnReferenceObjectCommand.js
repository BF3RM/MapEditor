const SpawnReferenceObjectCommand = function (blueprint) {

	Command.call(this);

	this.type = 'SpawnReferenceObjectCommand';
	this.name = 'Spawn ReferenceObject';

	if (blueprint === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Tried to spawn nothing");
		return;
	}
	this.command = {
		"SpawnReferenceObject": blueprint
	}
};


SpawnReferenceObjectCommand.prototype = {

	execute: function () {
		editor.vext.SpawnReferenceObject(this.command)
	},

	undo: function () {

		editor.vext.DestroyGameObject( this.command );
	},
};

