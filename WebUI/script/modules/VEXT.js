class VEXTInterface {
	constructor() {
		this.vextEvents = new VextEvents();
		this.messages = 0;
		//setInterval(function() {
		//	editor.vext.SendEvents();
		//}, 33);

	}

	SendEvent(id, key, value) {
		if (editor.debug) {
			//console.log(key + " = " + value);
		}

		this.vextEvents.AddEvent(this.messages, id, key, value);
		this.messages++;
	}

	DirectSend(name, parameter) {
		if(editor.debug) {
			return;
		}
		WebUI.Call('DispatchEventLocal', name, parameter);
	}

	SendEvents() {

		if(this.vextEvents === undefined || this.vextEvents.length == 0) {
			return;
		}
		this.vextEvents.Sort();
		for (let index in this.vextEvents.sortedEvents) {


			if(editor.debug) {
				console.log(this.vextEvents.sortedEvents[index].key, this.vextEvents.sortedEvents[index].value)
			} else {
				WebUI.Call('DispatchEventLocal',this.vextEvents.sortedEvents[index].key, this.vextEvents.sortedEvents[index].value);
			}

		}
		this.vextEvents = new VextEvents();
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

	SpawnGameObject(gameObject) {
		console.log(JSON.stringify(gameObject))
	}

	DestroyGameObject(gameObject) {
		
	}
}