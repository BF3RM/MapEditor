class Inspector {
	constructor() {
		this.dom = null;
		this.transform = null;
		this.name = null;
		this.variation = null;
		this.enabled = false;
		this.Initialize();

		signals.selectedGameObject.add(this.onSelectedGameObject.bind(this));
		signals.deselectedGameObject.add(this.onDeselectedGameObject.bind(this));
		signals.selectionGroupMoved.add(this.onSelectionGroupMoved.bind(this));
		signals.objectChanged.add(this.onObjectChanged.bind(this));

		this.updates = {
			// "transform": this.UpdateTransform.bind(this),
			"name": this.UpdateName.bind(this),
			"variation": this.UpdateVariation.bind(this),
		}
	}

	//TODO: OnUpdate events, transform shit


	Initialize () {
		let content = $(document.createElement("div"));
		content.attr("id", "objectInspector");

		if(debugMode) {
			let spawnTest = $(document.createElement("button"));
			spawnTest.text("Spawn");
			spawnTest.on("click", function() {
				Test(10000)
			});
			content.append(spawnTest);
		}

		let nameControl = $(document.createElement("div"));
		content.append(nameControl);
		nameControl.addClass("name");

		let nameLabel = $(document.createElement("label"));
		nameControl.append(nameLabel);
		nameLabel.attr("for", "objectName");
		nameLabel.text("Name");

		let nameInput = $(document.createElement("input"));
		nameControl.append(nameInput);
		nameInput.attr({
			"id": "objectName",
			"type": "text",
			"value": "name"
		});
		this.name = nameInput;

		$(nameInput).on('change',function(){
			if (editor.selectionGroup.children.length === 0){ return;}

			editor.execute(new SetObjectNameCommand(editor.selectionGroup.children[0].guid, this.value));
		});

		let transformControl = $(document.createElement("div"));
		transformControl.addClass("transform");
		content.append(transformControl);
		this.transform = {};

		let variationControl = $(document.createElement("div"));
		content.append(variationControl);
		variationControl.addClass("variation");

		let variationLabel = $(document.createElement("label"));
		variationControl.append(variationLabel);
		variationLabel.attr("for", "objectVariation");
		variationLabel.text("Variation");

		this.variation = $(document.createElement("select"));
		variationControl.append(this.variation);
		this.variation.attr({
			"id": "objectVariation"
		});
		this.variation.prop("disabled", true);

		this.variation.on('change',function(){
			if (editor.selectionGroup.children.length === 0){
				return;
			}

			let variationKey = this.value
			editor.execute(new SetVariationCommand(editor.selectionGroup.children[0].guid, variationKey));
		});

		let deleteButton = $(document.createElement("button"));
		deleteButton.addClass("deleteButton");
		deleteButton.text("Delete");
		deleteButton.click(function(){
			editor.ui.dialogs["deleteEntity"].dialog("open");
		});
		content.append(deleteButton);

		
		let controls = ["position", "rotation", "scale"];
		let xyz = ["x","y","z"];
		let transform = this.transform;
		let inspector = this;
		$.each(controls, function (index, con) {
			transformControl.append("<h2>" + con + "</h2>");
			let controller = $(document.createElement("div"));
			transformControl.append(controller);
			controller.addClass(con);
			transform[con] = {};

			$.each(xyz, function(index2, val) {
				let label = $(document.createElement("label"));
				controller.append(label);
				label.attr("for", con +val);
				label.text(val + ":");
				let inp = $(document.createElement("input"));
				inp.attr({
					"name": con+val,
					"id": con+val,
					"type": "number",
					"value": "0"
				});
				inp.spinner({
				  step: 0.01,
				  numberFormat: "n"
				});
				controller.append(inp);
				transform[con][val] = inp;
				inp.on('input', function(e) {
					inspector.SetTransform(con, val, $(this).val());
				});
				inp.on('change', function(e) {
					inspector.SetTransform(con, val, $(this).val(), true);
				});


				label.on('mousedown', handleMouse);

				//TODO: Link the values directly somehow?
			})
		});
		this.dom = content;
		this.HideContent();
	}

	SetTransform(type, key, value, final = false) {
		// TODO: The displayed rotation is technically correct, it just doesn't display the way I want it to. Make sure the rotation displays in an unoptimal way.
		if(isNaN(value) || value == "") {
			console.log("shitballs")
			this.transform[type][key].addClass("invalid")
			return
		}

		// Don't do anything if theres nothing selected or there are multiple things selected
		// if (editor.selectionGroup.children.length !== 1) {
		// 	return;
		// }

		if(this.transform[type][key].hasClass("invalid")) {
			this.transform[type][key].removeClass("invalid")
		}
		
		// Note that we aren't changing the world transform to local transform here, bc selection group's parent is always the scene (local == world).
		// Maybe change this to LinearTransform and call seletionGroup.setTransform()

		// Rotation needs to be converted first.
		if(type == "rotation") {
			let eulerRot = new THREE.Euler( this.transform.rotation.x.val() * THREE.Math.DEG2RAD, this.transform.rotation.y.val() * THREE.Math.DEG2RAD, this.transform.rotation.z.val() * THREE.Math.DEG2RAD);
			editor.selectionGroup.rotation.copy(eulerRot);
		} else {			
			editor.selectionGroup[type][key] = Number(value);
		}
		editor.threeManager.Render();
		editor.selectionGroup.onMove();

		if(!final) {
			editor.setUpdating(true);
		} else {
			editor.setUpdating(false);
			editor.selectionGroup.onMoveEnd();
		}
	}

	UpdateInspector(selectionGroup, isMultipleSelection) {

		if(selectionGroup == null) {
			console.log("Tried to update the inspector and selectionGroup is null?");
			return;
		}

		if (isMultipleSelection) {
			this.UpdateName(selectionGroup, selectionGroup.name);
		}else{
			let gameObject = selectionGroup.children[0];
			if (gameObject == null){
				// Selection group has no children
				return;
			}

			this.UpdateName(gameObject, gameObject.name);
			if (selectionGroup.type === "GameObject") {
				this.UpdateVariation(gameObject, gameObject.userData.variation);
			}
			
		}
		
		this.UpdateTransform(selectionGroup, selectionGroup.transform);
		
	}

	HideContent() {
		this.dom.hide()
	}
	ShowContent() {
		this.dom.show()
	}

	onSelectedGameObject(guid, isMultipleSelection) {
		let gameObject = editor.getGameObjectByGuid(guid);
		if(gameObject === undefined) {
			let variationSelect = $(document.getElementById("objectVariation"));
			variationSelect.prop("disabled", true);
			variationSelect.empty();
			LogError("Tried to set the name of a null entry. " + guid);
			this.DisableInspector();
			return;
		}

		this.UpdateInspector(editor.selectionGroup, isMultipleSelection)
		this.ShowContent();
	}


	onDeselectedGameObject(guid) {
		// Set name and variation of child if there's only 1 child left
		if (editor.selectionGroup.children.length > 0) {
			this.UpdateInspector(editor.selectionGroup, false);
			this.ShowContent();
		} else {
			this.HideContent();
		}
	}

	onObjectChanged(go, key, value) {
		// Only update the inspector if the moved object is the first object selected in selectionGroup (they share the same matrix)
		if (editor.selectionGroup.children.length === 1 && editor.selectionGroup.children[0] === go) {
			if(this.updates[key] !== undefined) {
				this.updates[key](editor.selectionGroup, value);
			} else {
				this.UpdateInspector(editor.selectionGroup, editor.selectionGroup.children.length === 1);
			}
		}
	}

	onSelectionGroupMoved(){
		this.UpdateInspector(editor.selectionGroup, editor.selectionGroup.children.length === 1);
	}

	UpdateTransform(gameObject, linearTransform) {
		
		//NOTE: commented code is for world tansform, but as the selection group's parent is always the scene, local == world.

		// let position = new THREE.Vector3();
		// gameObject.getWorldPosition(position);

		// let quat = new THREE.Quaternion();
		// gameObject.getWorldQuaternion(quat);
		// let rotation = new THREE.Euler().setFromQuaternion(quat).toVector3();

		// let scale = new THREE.Vector3();
		// gameObject.getWorldScale(scale);

		let controls = ["position", "rotation", "scale"];
		// let controlsVal = [position, rotation, scale];
		let xyz = ["x","y","z"];
		let transform = this.transform;
		$.each(controls, function (index, con) {
			let control = gameObject[con];
			$.each(xyz, function(index2, val) {

				// if(isNaN(controlsVal[index][val])) {
				if(isNaN(control[val])) {
					console.log("dafuq")
					transform[con][val].addClass("invalid")
					return
				}
				if(transform[con][val].hasClass("invalid")) {
					transform[con][val].removeClass("invalid")
				}

				//If we're modifying Rotation. Using the controls key for redundancy
				if(con === controls[1]) {
					// transform[con][val][0].value = (controlsVal[index][val] * THREE.Math.RAD2DEG).toFixed(3);
					transform[con][val][0].value = (control[val] * THREE.Math.RAD2DEG).toFixed(3);
				} else {
					// transform[con][val][0].value = controlsVal[index][val].toFixed(3)
					transform[con][val][0].value = control[val].toFixed(3)
				}
			});
		});
	}
	UpdateName(go, name) {
		this.name[0].value = name;
	}
	UpdateVariation(go, variation) {
		// We're refreshing the whole thing. Might as well, right?
		let blueprint =  editor.blueprintManager.getBlueprintByGuid(go.userData.reference.instanceGuid);
		if(!blueprint.hasVariation()){
			this.variation.prop("disabled", true);
			this.variation.empty();
			LogError("Blueprint Variations not available");
		}else{
			console.log(blueprint.variations);
			this.variation.prop("disabled", false);
			this.variation.empty();

			for(let key in blueprint.variations) {
				let newOption = new Option(blueprint.variations[key], key);
				this.variation.append(newOption);
			}
		}
		this.variation.find("option[value=" + variation  + "]").attr("selected",true);
	}
}

var InspectorComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Inspector();

	this._container.getElement().html(this.element.dom);
	this._container.getElement().parents().attr('id', 'inspector');


};