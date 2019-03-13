class EditorCore {
    constructor(debug) {

        this.playerName = null;

        this.isUpdating = false;

        this.lastUpdateTime = 0;
        this.deltaTime = 1.0/30.0;

        this._renderLoop = this.renderLoop.bind(this);
        this.renderLoop(); // first call to init loop using the requestAnimationFrame
    }
    setPlayerName(name) {
        if(name === undefined) {
            LogError("Failed to set player name");
        } else {
            this.playerName = name;
        }
    }
    getPlayerName(name) {
        return this.playerName;
    }

    toJson() {
        let scope = editor;
        let result = {};
        for (let k in scope.gameObjects){
            if (scope.gameObjects.hasOwnProperty(k)) {
                let gameObject = scope.gameObjects[k];
                result[k] = gameObject.userData;
            }
        }
        return JSON.stringify(result, null, 2);
    }

    setUpdating(value) {
        this.isUpdating = value;
        if(value) {
            this.renderLoop()
        }
    }
    renderLoop()
    {
        let scope = this;
        //GameObject update

        //This var is checked twice because we might have stopped the rendering during the last update.
        if(scope.isUpdating === false) {
            return;
        }
        if ( scope.lastUpdateTime === 0 ||
            scope.lastUpdateTime + (scope.deltaTime*1000.0) <= Date.now())
        {
            scope.lastUpdateTime = Date.now();

            /*for ( var key in this.gameObjects )
            {
                var object = this.gameObjects[key];

                if (object.update != undefined)
                    object.update( this.deltaTime );

            }
            */
            for(let guid in editor.pendingMessages) {
                if(!editor.pendingMessages.hasOwnProperty(guid)) {
                    continue;
                }
                let changes = editor.pendingMessages[guid].getChanges();
                if(!changes) {
                    continue;
                }
                for(let changeKey in changes) {
                    if(!changes.hasOwnProperty(changeKey)) {
                        continue;
                    }
                    let change = changes[changeKey];
                    editor.vext.SendMessage(change);
                }
                delete editor.pendingMessages[guid];
            }
        }

        //Gameobject render
        //this.threeManager.Render( );

        if(this.isUpdating) {
            window.requestAnimationFrame( this._renderLoop );
        }
    }
}