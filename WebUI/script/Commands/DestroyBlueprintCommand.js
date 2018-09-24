const DestroyBlueprintCommand = function (guid) {

	Command.call(this);

	this.type = 'DestroyBlueprintCommand';
	this.name = 'Destroy Blueprint';
	this.guid = guid;

	this.gameObject = editor.getGameObjectByGuid(guid);

	if(this.gameObject === undefined) {
		editor.logger.LogError("Attempted to destroy a null GameObject")
	} else {
		this.gameObject = this.gameObject.Clone(this.guid);
	}
};


DestroyBlueprintCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "SpawnBlueprintCommand", this.gameObject.parameters, this.gameObject.transform))
	},
};

