class GroupObject extends GameObject{
    constructor(id, name, webObject, transform, parent, children) {

        //guid, name, type, transform, webObject, instance, variation, parent
        super(id, name, "group", transform, webObject, null, null, parent);
        this.children = children;
    }

    OnAddChild(child){

        // Move group to first child's position
        if (this.children.length == null && this.transform.trans.x == 0) {
            this.Move(child.webObject.position.x, child.webObject.position.y, child.webObject.position.z)
            this.transform = child.transform;

        }

        // Remove child from its parent
        if(child.parent!= null){
            child.parent.OnRemoveChild(child);
        }

        // Update parent
        child.parent = this;
        delete editor.rootEntities[child.id];

        this.children[child.id] = child;

        editor.webGL.AddToGroup(this.webObject, child.webObject);

    }

    OnRemoveChild(child){
        // Update child parent
        child.parent = null;
        editor.rootEntities[child.id] = child;

        // Remove child from group
        delete this.children[child.id];
        editor.webGL.RemoveFromGroup(child.webObject);
    }

    Clone(newParent) {
        console.log("group with guid "+ this.guid);

        //Parent has to be null to avid circular referencing, we update it after cloning its children
        let clone = editor.CreateGroup(GenerateGuid(), this.name, this.transform, null);
        if (this.children != null) {

            for (var key in this.children) {
                this.children[key].Clone(clone);
            }
        }

        // Move it inside the parent
        if(newParent != null){
            editor.ui.hierarchy.MoveElementsInHierarchy(newParent, clone);
        }
    }
}