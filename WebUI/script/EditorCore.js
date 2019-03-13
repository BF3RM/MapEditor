class EditorCore {
    constructor() {
        this.raycastTransform = new LinearTransform();
        this.screenToWorldTransform = new LinearTransform();

        this.previewBlueprint = null;
        this.previewing = false;

        this.isUpdating = false;

        this.lastUpdateTime = 0;
        this.deltaTime = 1.0/30.0;

        this._renderLoop = this.renderLoop.bind(this);
        this.renderLoop(); // first call to init loop using the requestAnimationFrame
    }


    onSelectedGameObject(guid, isMultiSelection) {
        let scope = editor;
        let gameObject = scope.gameObjects[guid];

        if(gameObject === undefined) {
            LogError("Failed to select gameobject: " + guid);
            return;
        }

        // If the object is already in this group and it's a multiselection we deselect it
        if (gameObject.parent === scope.selectionGroup && isMultiSelection){
            scope.Deselect(guid);
            return;
        }

        // If we are selecting and object already selected (single selection)
        if (gameObject.parent === scope.selectionGroup && !isMultiSelection && scope.selectionGroup.children.length === 1 && scope.selectionGroup.children[0] === gameObject){
            return;
        }

        // Clear selection group when it's a single selection
        if(!isMultiSelection && scope.selectionGroup.children.length !== 0) {
            for (var i = scope.selectionGroup.children.length - 1; i >= 0; i--) {
                scope.Deselect(scope.selectionGroup.children[i].guid);
            }
        }

        if (gameObject.type === "GameObject"){
            if (scope.selectionGroup.children.length === 0) {
                scope.selectionGroup.setTransform(new LinearTransform().setFromMatrix(gameObject.matrixWorld));
            }

            scope.selectionGroup.AttachObject(gameObject);

        }else if (gameObject.type === "Group"){
            gameObject.Select();
            //TODO: update inspector with the group name
        }
        signals.selectedGameObject.dispatch(guid, isMultiSelection);

        scope.selectionGroup.Select();
        if(scope.selectionGroup.children.length !== 0) {
            scope.threeManager.ShowGizmo();
        }
        scope.threeManager.AttachGizmoTo(scope.selectionGroup);
        scope.threeManager.Render();

    }

    onDeselectedGameObject(guid) {
        let scope = editor;
        let gameObject = scope.gameObjects[guid];
        scope.selectionGroup.DeselectObject(gameObject);
        signals.deselectedGameObject.dispatch(guid);
        if(scope.selectionGroup.children.length === 0) {
            scope.threeManager.HideGizmo()
        }
        scope.threeManager.Render();
    }

    getRaycastTransform() {
        return this.raycastTransform.clone()
    }

    static toJson() {
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

        if(this.isUpdating) {
            window.requestAnimationFrame( this._renderLoop );
        }
    }


    onPreviewDragStart(blueprint) {
        this.previewing = true;
        this.previewBlueprint = blueprint;
    }

    onPreviewDrag(e) {
        let direction = editor.threeManager.getMouse3D(e);
        let s2wMessage = new SetScreenToWorldTransformMessage(direction);
        editor.vext.SendMessage(s2wMessage);
        if(this.previewBlueprint == null) {
            return
        }
        let moveMessage = new PreviewMoveMessage(this.screenToWorldTransform.clone());
        editor.vext.SendMessage(moveMessage);

    }

    onPreviewDragStop() {
        this.previewBlueprint = null;
        this.previewing = false;
    }

    onPreviewStart() {
        this.previewing = true;
        let userData = this.previewBlueprint.getUserData();
        let message = new PreviewSpawnMessage(userData);
        editor.vext.SendMessage(message);
    }

    onPreviewStop() {
        this.previewing = false;
        editor.vext.SendMessage(new PreviewDestroyMessage());
    }

    onPreviewDrop() {
        this.previewing = false;
        editor.onBlueprintSpawnRequested(this.previewBlueprint, this.screenToWorldTransform, this.previewBlueprint.getDefaultVariation());
        editor.vext.SendMessage(new PreviewDestroyMessage());

        this.previewBlueprint = null;

    }
}