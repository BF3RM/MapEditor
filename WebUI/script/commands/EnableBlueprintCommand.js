const EnableBlueprintCommand = function (guid) {

    Command.call(this);

    this.type = 'EnableBlueprintCommand';
    this.name = 'Enable Blueprint';
    this.guid = guid;
};


EnableBlueprintCommand.prototype = {

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
        editor.vext.SendCommand(new VextCommand("DisableBlueprintCommand", gameObjectData))
    },
};

