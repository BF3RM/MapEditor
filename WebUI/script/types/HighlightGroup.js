class HighlightGroup extends THREE.Group{
	constructor()
	{
		super( );

		this.guid = GenerateGuid()
		this.type = "HighlightGroup";
		this.name = "Highlighting Group";
	}

	HighlightObject(gameObject){
		
		if(gameObject.selected || gameObject.highlighted) return;
		console.log("Highlighting")
		if (gameObject.parent === null || gameObject.parent === undefined){
			editor.threeManager.scene.add(gameObject);
		}

		this.UnhighlightCurrentObject();
		this.AttachObject(gameObject);
		gameObject.Highlight();
	}

	UnhighlightCurrentObject(){


		let currentObject = this.GetHighlightedGameObject();
		if (currentObject !== undefined && currentObject !== null) {
			console.log("Unhighlighting")
			this.DetachObject(currentObject);
			currentObject.Unhighlight();
		}
	}

	DetachObject(gameObject){

		if (gameObject.parent != this){
			console.error("Tried to detach a children that is no longer in this group");
		}
		THREE.SceneUtils.detach( gameObject, this, editor.threeManager.scene );

		// remove child from parent and add it to scene
		if(gameObject.parentGuid !== null && gameObject.parentGuid !== undefined) {
			let parent = editor.getGameObjectByGuid(gameObject.parentGuid);
			if(parent !== null && parent !== undefined) {
				THREE.SceneUtils.attach( gameObject, editor.threeManager.scene, parent );
			}
			else{
				console.error("Object parent doesn't exist")
			}
		}

		editor.threeManager.scene.remove(gameObject);

		editor.threeManager.Render(); // REMOVE
	}

	AttachObject(gameObject){

		// don't do anything if the target group it the object group already
		if (gameObject.parent === this){
			return;
		}

		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( gameObject, gameObject.parent, editor.threeManager.scene );

		// remove child from scene and add it to parent
		THREE.SceneUtils.attach( gameObject, editor.threeManager.scene, this );

		editor.threeManager.Render(); // REMOVE
	}

	GetHighlightedGameObject(){
		return this.children[0];
	}
}