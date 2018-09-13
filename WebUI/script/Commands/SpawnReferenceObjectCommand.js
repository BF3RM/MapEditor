const SpawnReferenceObjectCommand = function (reference, transform, variation) {

	Command.call(this);

	this.type = 'SpawnReferenceObjectCommand';
	this.name = 'Spawn ReferenceObject';

	if (reference === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Tried to spawn nothing");
		return;
	}
	this.command = {
		"reference": reference,
		"transform": transform,
		"variation": variation
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

