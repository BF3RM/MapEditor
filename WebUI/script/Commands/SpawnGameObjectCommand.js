const SpawnGameObjectCommand = function (gameObject) {

	Command.call(this);

	this.type = 'SpawnGameObjectCommand';
	this.name = 'Spawn GameObject';

	if (gameObject === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Tried to spawn nothing");
		return;
	}
	this.command = {
		"CreateGameObject": gameObject
	}
};


SpawnGameObjectCommand.prototype = {

	execute: function () {
		editor.vext.SpawnGameObject(this.command)
	},

	undo: function () {

		editor.vext.DestroyGameObject( this.command );
	},
};

