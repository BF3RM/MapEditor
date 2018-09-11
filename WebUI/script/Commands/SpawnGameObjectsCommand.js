const SpawnGameObjectsCommand = function (gameObjects) {

	Command.call(this);

	this.type = 'SpawnGameObjectsCommand';
	this.name = 'Spawn GameObjects';

	if (gameObjects === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Tried to spawn nothing");
		return;
	}
	this.gameObjects = gameObjects;
};


SpawnGameObjectsCommand.prototype = {

	execute: function () {
		editor.vext.SpawnGameObject(this.gameObjects)
	},

	undo: function () {

		editor.vext.DestroyGameObject( this.gameObjects );
	},
};

