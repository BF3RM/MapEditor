class CommandActionResult {
    constructor(type, name, gameObjectTransferData) {
        this.type = type;
        this.sender = name;
        this.gameObjectTransferData = gameObjectTransferData;
    }

    setFromTable(table) {
        this.type = table.type;
        this.sender = table.sender;
        this.gameObjectTransferData = new GameObjectTransferData().setFromTable(table.gameObjectTransferData);

        return this;
    }
}