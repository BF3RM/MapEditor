class GameContext {
    constructor() {

    }

    LoadLevel(levelRaw) {
        let levelData = JSON.parse(levelRaw);
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