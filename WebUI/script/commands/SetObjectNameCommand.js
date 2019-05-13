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
		this.oldName = editor.getGameObjectByGuid(guid).name;
	}
};


SetObjectNameCommand.prototype = {

	execute: function () {
		let gameObjectData = {
			'guid': this.guid,
			'name': this.name
		};
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
	},

	undo: function () {
		let gameObjectData = {
			'guid': this.guid,
			'name': this.oldName
		};
		editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
	},
};
