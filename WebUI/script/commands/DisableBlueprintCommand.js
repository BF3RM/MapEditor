const DisableBlueprintCommand = function (guid) {

    Command.call(this);

    this.type = 'DisableBlueprintCommand';
    this.name = 'Disable Blueprint';
    this.guid = guid;
};


DisableBlueprintCommand.prototype = {

    execute: function () {
        let gameObjectData = {
            'guid': this.guid
        };
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectData))
    },

    undo: function () {
        let gameObjectData = {
            'guid': this.guid
        };
        editor.vext.SendCommand(new VextCommand("EnableBlueprintCommand", gameObjectData))
    },
};

