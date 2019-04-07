const DisableBlueprintCommand = function (guid) {

    Command.call(this);

    this.type = 'DisableBlueprintCommand';
    this.name = 'Disable Blueprint';
    this.guid = guid;
};


DisableBlueprintCommand.prototype = {

    execute: function () {
        editor.vext.SendCommand(new VextCommand(this.guid, this.type))
    },

    undo: function () {
        editor.vext.SendCommand(new VextCommand(this.guid, "EnableBlueprintCommand"))
    },
};

