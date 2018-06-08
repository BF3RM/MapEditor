class VEXTInterface {
	constructor(){

	};

	SendEvent(type, name, parameter) {

		if (editor.debug) {
			console.log(name + " = " + parameter);
			return;
		}
		WebUI.Call(type, name, parameter)
	}

	RegisterInstances(json) {
		editor.OnRegisterInstances(json);
	}

	HideGizmo() {
		editor.webGL.HideGizmo();
	}
	ShowGizmo() {
		editor.webGL.ShowGizmo();
	}

	SpawnedEntity(id, blueprintGuid, matrixString) {
		editor.OnSpawnedEntity(id, blueprintGuid, matrixString);
	}
	RemoveEntity(id) {
		editor.OnRemoveEntity(id);
	}
}