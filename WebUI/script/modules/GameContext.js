class GameContext {
    constructor() {
        this.levelData = {};
    }

    LoadLevel(levelRaw) {
        let levelData = JSON.parse(levelRaw);
        this.levelData[levelData.instanceGuid] = levelData;
        signals.levelLoaded.dispatch(levelData);
        //signals.levelLoaded.dispatch(this.data);
    }

    ParseUserData(userData) {
        return {
            guid: userData.Guid,
            name: userData.Name,
            type: userData.TypeName,
            parent: userData.Parent,
            state: {
                open: true
            },
            selectable: false,
            children: []
        };
    }

}