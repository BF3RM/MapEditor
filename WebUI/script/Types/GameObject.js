class GameObject {
    constructor(id, name, type, transform, webObject, instance, variation, parent) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.transform = transform;
        this.initialTransform = transform;
        this.webObject = webObject;
        this.instance = instance;
        this.parent = parent;
        this.variation = variation;

        if (this.parent == null) {
            editor.rootEntities[this.id] = this;
        }
        else{
            parent.children[this.id] = this;
        }
    }

    Move(x, y, z){
        editor.webGL.MoveObject(this.webObject, x, y, z);
        this.OnMove(false);
    }

    OnMove(noUpdateInspector) {
        let matrix = this.webObject.matrixWorld.toArray();
        matrix[12] = matrix[12].toFixed(4);
        matrix[13] = matrix[13].toFixed(4);
        matrix[14] = matrix[14].toFixed(4);


        matrix = matrix.toString();
        if(matrix.includes("NaN")) {
            this.webObject.matrixWorld.SetEntityMatrix(this.transform.getAsArray);
            return
        }
        let linearTransform = new LinearTransform().setFromMatrix(this.webObject.matrixWorld);
        let args = this.id + ":" + linearTransform.getAsArray().toString();
        this.transform = linearTransform;

        if(!noUpdateInspector) {
            editor.ui.inspector.UpdateInspector(this);
        }

        // Move children if there is any
        if (this.children != null) {

            for (var key in this.children) {
                this.children[key].OnMove(true);
            }

        }
        else{
            editor.vext.SendEvent(this.id, 'MapEditor:SetEntityMatrix', args);
        }
    }

    OnSelected() {
        console.log("Selected")
    }

    OnDeleted() {
        console.log("Deleted")
    }

    Delete() {
        // Deselect this entity
        editor.DeselectEntity(this);

        // Delete its children
        if (this.children != null) {

            for (var key in this.children) {
                this.children[key].Delete();
            }
        }

        else{
            // Delete the entity on VU
            editor.vext.SendEvent(this.id, 'MapEditor:DeleteEntity', this.id)
        }

        // Remove the parent's reference
        if (this.parent != null) {
            delete this.parent.children[this.id];
        }

        // Delete webGL objects associated with the entity
        editor.webGL.DeleteObject(this.webObject);

        // Remove the entity on reference arrays
        delete editor.spawnedEntities[this.id];
        if (editor.rootEntities[this.id] != null) {
            delete editor.rootEntities[this.id];
        }

        // Delete the entity on the hierarchy
        editor.ui.hierarchy.OnDeleteEntry(this);


    }

    Clone(newParent){
        let parentId = "";
        if(newParent != null){
            parentId = newParent.id;
        }
        let args = GenerateGuid() + ":" + this.instance.partitionGuid+ ":" + this.instance.instanceGuid+ ":" + this.variation + ":" + this.transform.getAsArray().toString()+ ":" + parentId;
        console.log(args);
        editor.vext.SendEvent(this.id, 'MapEditor:SpawnInstance', args);
    }
}
