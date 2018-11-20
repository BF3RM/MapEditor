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
		signals.objectChanged.add(this.onObjectChanged.bind(this));

		this.updates = {
			"transform": this.UpdateTransform.bind(this),
			"name": this.UpdateName.bind(this),
			"variation": this.UpdateVariation.bind(this),
		}
	}

	//TODO: OnUpdate events, transform shit


	Initialize () {
		let content = $(document.createElement("div"));
		content.attr("id", "objectInspector");

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
			editor.execute(new SetObjectNameCommand(editor.selected.guid, this.value));
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
			editor.execute(new SetVariationCommand(editor.selected.guid, this.value));
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
	}

	SetTransform(type, key, value, final = false) {
		// TODO: The displayed rotation is technically correct, it just doesn't display the way I want it to. Make sure the rotation displays in an unoptimal way.
		if(isNaN(value) || value == "") {
			console.log("shitballs")
			this.transform[type][key].addClass("invalid")
			return
		}
		if(this.transform[type][key].hasClass("invalid")) {
			this.transform[type][key].removeClass("invalid")
		}
		// Rotation needs to be converted first.
		if(type == "rotation") {
			let eulerRot = new THREE.Euler( this.transform.rotation.x.val() * THREE.Math.DEG2RAD, this.transform.rotation.y.val() * THREE.Math.DEG2RAD, this.transform.rotation.z.val() * THREE.Math.DEG2RAD);
			editor.selectionGroup.rotation.copy(eulerRot);
		} else {
		   // editor.selected[type][key] = Number(value);
		}
		editor.webGL.Render();
		editor.selectionGroup.onMove();

		if(!final) {
			editor.setUpdating(true);
		} else {
			editor.setUpdating(false);
			editor.selectionGroup.onMoveEnd();
		}
	}

	UpdateInspector(gameObject) {
		if(gameObject == null) {
			console.log("Tried to update the inspector with an invalid gameobject?");
			return
		}
		this.EnableInspector();
		this.UpdateName(gameObject, gameObject.name);
		this.UpdateTransform(gameObject, gameObject.transform);
		this.UpdateVariation(gameObject, gameObject.parameters.variation);
	}



	HideContent() {
		this.dom.hide()
	}
	ShowContent() {
		this.dom.show()
	}

	onSelectedGameObject(command) {
		let gameObject = editor.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			let variationSelect = $(document.getElementById("objectVariation"));
			variationSelect.prop("disabled", true);
			variationSelect.empty();
			editor.logger.LogError("Tried to set the name of a null entry. " + command.guid);
			this.DisableInspector();
			return;
		}

		if (!command.parameters.multiple ){
			this.UpdateInspector(gameObject);
		}else{
			this.DisableInspector();
		}
		
	}

	DisableInspector(){
		$('#objectInspector').css('opacity', '0.6');
		//TODO: disable inputs
	}

	EnableInspector(){
		$('#objectInspector').css('opacity', '1');
	}


	onDeselectedGameObject(command){
		//TODO: disable inspector if necessary
	}

	onObjectChanged(go, key, value) {
		if(this.updates[key] !== undefined) {
			this.updates[key](go, value);
		} else {
			this.UpdateInspector(go);
		}
	}

	UpdateTransform(go, linearTransform) {
		let controls = ["position", "rotation", "scale"];
		let xyz = ["x","y","z"];
		let transform = this.transform;
		$.each(controls, function (index, con) {
			let control = go[con];
			$.each(xyz, function(index2, val) {


				if(isNaN(control[val])) {
					transform[con][val].addClass("invalid")
					return
				}
				if(transform[con][val].hasClass("invalid")) {
					transform[con][val].removeClass("invalid")
				}


				//If we're modifying Rotation. Using the controls key for redundancy
				if(con === controls[1]) {
					transform[con][val][0].value = (control[val] * THREE.Math.RAD2DEG).toFixed(3);
				} else {
					transform[con][val][0].value =control[val].toFixed(3)
				}
			});
		});
	}
	UpdateName(go, name) {
		this.name[0].value = name;
	}
	UpdateVariation(go, variation) {
		// We're refreshing the whole thing. Might as well, right?
		let blueprint =  editor.blueprintManager.getBlueprintByGuid(go.parameters.reference.instanceGuid);
		if(!blueprint.hasVariation()){
			this.variation.prop("disabled", true);
			this.variation.empty();
			editor.logger.LogError("Blueprint Variations not available");
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