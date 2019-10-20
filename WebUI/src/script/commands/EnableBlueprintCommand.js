const EnableBlueprintCommand = function (gameObjectTransferData) {

    Command.call(this);

    this.type = 'EnableBlueprintCommand';
    this.name = 'Enable Blueprint';
    this.gameObjectTransferData = gameObjectTransferData;
};


EnableBlueprintCommand.prototype = {
    execute: function () {
        let gameObjectTransferData = new GameObjectTransferData({
            'guid': this.gameObjectTransferData.guid
        });
        editor.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData))
    },

    undo: function () {
        let gameObjectTransferData = new GameObjectTransferData({
            'guid': this.gameObjectTransferData.guid
        });
        editor.vext.SendCommand(new VextCommand("DisableBlueprintCommand", gameObjectTransferData))
    },
};

