const CreateGroupCommand = function (guid, parameters) {

	Command.call(this);

	this.type = 'CreateGroupCommand';
	this.name = 'Create Group: ' + parameters.name;
	this.guid = guid;

	if (parameters === undefined) {
		editor.logger.Log(LOGLEVEL.DEBUG, "Missing spawn userData");
		return;
	}
	this.parameters = parameters;
};


CreateGroupCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.parameters))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, "DestroyGroupCommand", this.parameters))
	},
};

