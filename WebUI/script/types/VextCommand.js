
class VextCommand {
    constructor(type, gameObjectTransferData) {
        this.type = type;
        // The GameObjectTransferData can be incomplete, it gets merged with existing data on lua side
        // Only send the minimal info required by the CommandActions
        this.gameObjectTransferData = gameObjectTransferData;
    }
}
