const DestroyGroupCommand = function (guid) {

	Command.call(this);

	this.type = 'DestroyGroupCommand';
	this.name = 'Destroy Group';
	this.guid = guid;

	this.gameObject = editor.getGameObjectByGuid(guid);

	if(this.gameObject === undefined) {
		editor.logger.LogError("Attempted to destroy a null GameObject")
	} else {
		this.gameObject = this.gameObject.Clone(this.guid);
	}
};


DestroyGroupCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "CreateGroupCommand", this.gameObject.parameters))
	},
};

