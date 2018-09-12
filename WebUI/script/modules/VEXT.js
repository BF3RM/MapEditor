class VEXTInterface {


	HideGizmo() {
		editor.webGL.HideGizmo();
	}
	ShowGizmo() {
		editor.webGL.ShowGizmo();
	}

	SpawnGameObject(gameObject) {
		console.log(JSON.stringify(gameObject))
		if(editor.debug) {

		}
	}

	DestroyGameObject(gameObject) {

	}

	onSpawnGameObject(gameObjectString) {

	}
}