
class GameObjectTransferData
{
    constructor(args = {})
    {
        if (Object.keys(args).length !== 0 &&  args.guid === undefined) {
            LogError("Attempted to create a GameObjectTransferData without a specified GUID")
        }

        this.guid = args.guid;
        this.name = args.name; // for debugging only
        this.parentData = args.parentData;
        this.blueprintCtrRef= args.blueprintCtrRef;
        this.transform = args.transform;
        this.variation = args.variation;
        this.gameEntities = args.gameEntities;
        this.isDeleted = args.isDeleted;
        this.isEnabled = args.isEnabled;
    }

    setFromTable(table) {
        let scope = this;
        if(table.guid === undefined) {
            LogError("Attempted to create a GameObjectTransferData without a specified GUID")
        }
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