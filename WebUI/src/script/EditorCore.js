class EditorCore {


    constructor() {
        this.raycastTransform = new LinearTransform();
        this.screenToWorldTransform = new LinearTransform();

        this.previewBlueprint = null;
        this.isPreviewBlueprintSpawned = false;

        this.isUpdating = false;

        this.lastUpdateTime = 0;
        this.deltaTime = 1.0/30.0;

        this.pendingMessages = {};

        this._renderLoop = this.renderLoop.bind(this);
        this.renderLoop(); // first call to init loop using the requestAnimationFrame
    }

    getRaycastTransform() {
        return this.raycastTransform.clone()
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
    addPending(guid, message) {
        this.pendingMessages[guid] = message;
    }

    onSelectedGameObject(guid, isMultiSelection, scrollTo) {
        let scope = editor;
        let gameObject = scope.gameObjects[guid];

        if(gameObject === undefined) {
            LogError("Failed to select gameobject: " + guid);
            return;
        }

        // If the object is not in the scene we add it
        if (gameObject.parent === null || gameObject.parent === undefined){
            scope.threeManager.scene.add(gameObject);
        }

        // If the object is already in this group and it's a multiselection we deselect it
        if (gameObject.parent === scope.selectionGroup && isMultiSelection){
            scope.Deselect(guid);
            return;
        }

        // If we are selecting an object already selected (single selection)
        if (gameObject.parent === scope.selectionGroup && !isMultiSelection && scope.selectionGroup.children.length === 1 && scope.selectionGroup.children[0] === gameObject){
            return;
        }

        // Clear selection group when it's a single selection
        if(!isMultiSelection && scope.selectionGroup.children.length !== 0) {
            for (let i = scope.selectionGroup.children.length - 1; i >= 0; i--) {
                scope.Deselect(scope.selectionGroup.children[i].guid);
            }
        }

        if (scope.selectionGroup.children.length === 0) {
            scope.selectionGroup.setTransform(new LinearTransform().setFromMatrix(gameObject.matrixWorld));
        }

        scope.selectionGroup.AttachObject(gameObject);

        signals.selectedGameObject.dispatch(guid, isMultiSelection, scrollTo);

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

        scope.threeManager.scene.remove(gameObject);

        signals.deselectedGameObject.dispatch(guid);
        if(scope.selectionGroup.children.length === 0) {
            scope.threeManager.HideGizmo()
        }
        scope.threeManager.Render();
    }

    onPreviewDragStart(blueprint) {
        this.previewBlueprint = blueprint;
    }

    onPreviewDrag(e) {
        let direction = editor.threeManager.getMouse3D(e);
        let s2wMessage = new SetScreenToWorldTransformMessage(direction);
        editor.vext.SendMessage(s2wMessage);

        if(this.previewBlueprint == null || this.isPreviewBlueprintSpawned === false) {
            return
        }

        let gameObjectTransferData = new GameObjectTransferData({
            "guid": editor.config.PreviewGameObjectGuid,
            "transform": this.screenToWorldTransform.clone()
        });

        editor.vext.SendMessage(new MoveObjectMessage(gameObjectTransferData));
    }

    onPreviewDragStop() {
        this.previewBlueprint = null;
        this.isPreviewBlueprintSpawned = false;
    }

    onPreviewStart() {
        if (this.previewBlueprint == null) {
            LogError("EditorCore.js:onPreviewStart(): this.previewBlueprint was null.");
            return;
        }

        let gameObjectTransferData = new GameObjectTransferData({
            "guid": editor.config.PreviewGameObjectGuid,
            "blueprintCtrRef": this.previewBlueprint.getCtrRef(),
            "transform": this.screenToWorldTransform.clone(),
            "variation": this.previewBlueprint.getDefaultVariation(),
        });

        editor.vext.SendMessage(new PreviewSpawnMessage(gameObjectTransferData));
        this.isPreviewBlueprintSpawned = true;
    }

    onPreviewStop() {
        let gameObjectTransferData = new GameObjectTransferData({ "guid": editor.config.PreviewGameObjectGuid });
        editor.vext.SendMessage(new PreviewDestroyMessage(gameObjectTransferData));
        this.isPreviewBlueprintSpawned = false;
    }

    onPreviewDrop() {
        editor.SpawnBlueprint(this.previewBlueprint, this.screenToWorldTransform, this.previewBlueprint.getDefaultVariation());

        let gameObjectTransferData = new GameObjectTransferData({ "guid": editor.config.PreviewGameObjectGuid });
        editor.vext.SendMessage(new PreviewDestroyMessage(gameObjectTransferData));
        this.isPreviewBlueprintSpawned = false;
        this.previewBlueprint = null;
    }
}
