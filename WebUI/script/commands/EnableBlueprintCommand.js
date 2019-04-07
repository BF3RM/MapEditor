const EnableBlueprintCommand = function (guid) {

    Command.call(this);

    this.type = 'EnableBlueprintCommand';
    this.name = 'Enable Blueprint';
    this.guid = guid;

};


EnableBlueprintCommand.prototype = {

    execute: function () {
        editor.vext.SendCommand(new VextCommand(this.guid, this.type))
    },

    undo: function () {
        editor.vext.SendCommand(new VextCommand(this.guid, "DisableBlueprintCommand"))
    },
};

