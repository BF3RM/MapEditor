const DestroyBlueprintCommand = function (guid) {

	Command.call(this);

	this.type = 'DestroyBlueprintCommand';
	this.name = 'Destroy Blueprint';
	this.guid = guid;

	let gameObject = editor.getGameObjectByGuid(guid);

	if (gameObject == null) {
		LogError("Tried destroying blueprint that was not existing.");
		return;
	}

	if(gameObject.gameObjectData == null) {
		LogError("Attempted to destroy a null GameObject without gameObjectData")
	} else {
		this.gameObjectData = iterationCopy(gameObjectData);
	}
};


DestroyBlueprintCommand.prototype = {

	execute: function () {
		let gameObjectData = {
			'guid': this.guid
		};
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData)) // the lua side doesnt need the gameObjectData just to delete the object, so we save memory
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand("SpawnBlueprintCommand", this.gameObjectData))
	},
};

