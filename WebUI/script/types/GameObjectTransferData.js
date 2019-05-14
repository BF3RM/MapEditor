
class GameObjectTransferData
{
    constructor(guid, name, blueprintCtrRef, parentData, transform, variation, gameEntities)
    {
        this.guid = guid;
        this.name = name; // for debugging only
        this.blueprintCtrRef= blueprintCtrRef;
        this.parentData = parentData;
        this.transform = transform;
        this.variation = variation;
        this.gameEntities = gameEntities
    }

    setFromTable(table) {
        let scope = this;
        Object.keys(table).forEach(function(key) {
            let value = table[key];

            switch(key) {
                case "blueprintCtrRef":
                    value = new CtrRef().setFromTable(value);
                    break;
                case "transform":
                    value = new LinearTransform().setFromTable(value);
                    break;
                case "parentData":
                    value = new GameObjectParentData().setFromTable(value);
                    break;
                case "gameEntities":
                    let gameEntities = [];
                    Object.keys(value).forEach(function(index) {
                        let gameEntityDataTable = value[index];
                        gameEntities.push(new GameEntityData().setFromTable(gameEntityDataTable))
                    });

                    value = gameEntities;
                default:
                    break;
            }

            scope[key] = value;
        });

        return this;
    }
}