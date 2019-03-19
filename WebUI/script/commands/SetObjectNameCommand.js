const SetObjectNameCommand = function (guid, name) {

	Command.call(this);

	this.type = 'SetObjectNameCommand';
	this.guid = guid;


	if (name === undefined) {
		LogError("Missing is name");
		return;
	} else {
		this.name = name;
	}

	if(editor.getGameObjectByGuid(guid) === undefined) {
		LogError("Attempted to set name for null GameObject");
	} else {
		this.oldname = editor.getGameObjectByGuid(guid).name;
	}
};


SetObjectNameCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.name))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.oldname))
	},
};
