
class VextCommand {
    constructor(type, partialGameObjectData) {
        this.type = type;
        // The GameObjectData can be incomplete, it gets merged with existing data on lua side
        // Only send the minimal info required by the CommandActions
        this.gameObjectData = partialGameObjectData;
    }
}
