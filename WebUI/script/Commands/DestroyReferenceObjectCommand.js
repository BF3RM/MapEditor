const DestroyReferenceObjectCommand = function (guid) {

	Command.call(this);

	this.type = 'DestroyReferenceObjectCommand';
	this.name = 'Destroy ReferenceObject';
	this.guid = guid;

	this.gameObject = editor.getGameObjectByGuid(guid);

	if(this.gameObject === undefined) {
		editor.logger.LogError("Attempted to destroy a null GameObject")
	} else {
		this.gameObject = this.gameObject.Clone(this.guid);
	}
};


DestroyReferenceObjectCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "SpawnReferenceObjectCommand", this.gameObject.parameters, this.gameObject.transform))
	},
};

