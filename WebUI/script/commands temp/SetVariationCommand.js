const SetVariationCommand = function (guid, key) {

	Command.call(this);

	this.type  = 'SetVariationCommand';
    this.key   = key;
    this.guid  = guid;


    if (key === undefined) {
		editor.logger.LogError("Missing is key");
		return;
	}

	if(editor.getGameObjectByGuid(guid) === undefined) {
		editor.logger.LogError("Attempted to set key for null GameObject");
	} else {
        this.oldkey = editor.getGameObjectByGuid(guid).parameters.variation;
	}
};


SetVariationCommand.prototype = {

	execute: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.key))
	},

	undo: function () {
		editor.vext.SendCommand(new VextCommand(this.guid, this.type, this.oldkey))
	},
};
