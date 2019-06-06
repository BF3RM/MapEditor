class HighlightGroup extends THREE.Group{
	constructor()
	{
		super( );

		this.guid = GenerateGuid();
		this.type = "HighlightGroup";
		this.name = "Highlighting Group";
	}

	HighlightObject(gameObject){
		
		if(gameObject.selected || gameObject.highlighted || gameObject.typeName === "WorldPartData" || gameObject.typeName === "LevelData") return;
		// console.log("Highlighting")

		this.UnhighlightCurrentObject();
		this.AttachObject(gameObject);
		gameObject.Highlight();
	}

	UnhighlightCurrentObject(){


		let currentObject = this.GetHighlightedGameObject();
		if (currentObject !== undefined && currentObject !== null) {
			// console.log("Unhighlighting")
			this.DetachObject(currentObject);
			currentObject.Unhighlight();
		}
	}

	DetachObject(gameObject){

		if (gameObject.parent !== this){
			console.error("Tried to detach a children that is no longer in this group");
		}
		THREE.SceneUtils.detach( gameObject, this, editor.threeManager.scene );

		// remove child from parent and add it to scene
		if(gameObject.parentData.guid !== null && gameObject.parentData.guid !== undefined && gameObject.parentData.typeName !== "LevelData") {
			let parent = editor.getGameObjectByGuid(gameObject.parentData.guid);
			if(parent !== null && parent !== undefined) {
				THREE.SceneUtils.attach( gameObject, editor.threeManager.scene, parent );
			}
			else{
				editor.threeManager.scene.remove(gameObject);
				console.error("Object parent doesn't exist.")
			}
		}else {
			editor.threeManager.scene.remove(gameObject);
		}

		editor.threeManager.Render(); // REMOVE
	}

	AttachObject(gameObject){

		// don't do anything if the target group it the object group already
		if (gameObject.parent === this){
			console.log("Object already in highlightGroup");
			return;
		}

		if (this.children.length > 0){
			console.error("Tried to attach an object to highlightGroup while it already has an object highlighted")
		}

		if (gameObject.parent === null) {
			editor.threeManager.scene.add(gameObject);
		}else{
			// remove child from parent and add it to scene
			THREE.SceneUtils.detach( gameObject, gameObject.parent, editor.threeManager.scene );
		}

		// remove child from scene and add it to parent
		THREE.SceneUtils.attach( gameObject, editor.threeManager.scene, this );

		editor.threeManager.Render(); // REMOVE
	}

	GetHighlightedGameObject(){
		return this.children[0];
	}
}