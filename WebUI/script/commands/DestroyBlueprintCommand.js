const DestroyBlueprintCommand = function (guid) {

	Command.call(this);

	this.type = 'DestroyBlueprintCommand';
	this.name = 'Destroy Blueprint';
	this.guid = guid;

	let gameObject = editor.getGameObjectByGuid(guid);

	if(gameObject === undefined) {
		LogError("Attempted to destroy a null GameObject")
	} else {
		this.userData = iterationCopy(gameObject.userData);
	}
};


DestroyBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "SpawnBlueprintCommand", this.userData))
	},
};

