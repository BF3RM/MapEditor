class GameContext {
    constructor() {

    }

    LoadLevel(levelRaw) {
        let level = JSON.parse(levelRaw);
        this.data = this.ParseUserData(level);
        console.log(this.data);
        signals.levelLoaded.dispatch(this.data);
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