class Blueprint {
	constructor(partitionGuid, instanceGuid, typeName, name, variations) {
		this.partitionGuid = partitionGuid;
		this.instanceGuid = instanceGuid;
		this.typeName = typeName;
		this.name = name;
		this.variations = variations;

		this.favorited = false;
	}

	getDefaultVariation() {
		let scope = this;
		if(scope.hasVariation()) {
			return this.variations[0].hash;

		} else {
			return 0;
		}
	}

	SetFavorite(favStatus) {
		this.favorited = favStatus;
	}

	ToggleFavorite() {
		this.favorited = !this.favorited;
	}

	hasVariation () {
		return !(this.variations === undefined || Object.keys(this.variations).length == null || Object.keys(this.variations).length === 0);
	}
	isVariationValid(variation) {
		let scope = this;
		return (scope.hasVariation() /* && scope.getVariation(variation) !== undefined */);
		// Always returns 0
	}

	getVariation(hash) {
		let scope = this;
		return scope.variations[hash];
		//tsk tsk tsk
	}

	fromObject(object) {
		if(object.partitionGuid === null || object.instanceGuid === null || object.name === null ) {
			editor.error("Failed to register blueprint from object: " + object);
		} else {
			this.partitionGuid = object.partitionGuid;
			this.instanceGuid = object.instanceGuid;
			this.typeName = object.typeName;
			this.name = object.name;
			this.variations = object.variations;
			return this;
		}
	}

	getReference() {
		let scope = this;
		return new ReferenceObject(scope.typeName, scope.name, scope.partitionGuid, scope.instanceGuid);
	}

	// Changes Some/Path/BlueprintName into just BlueprintName
	getName() {
		return this.name.substring(this.name.lastIndexOf('/')+1);
	}

	getReferenceObjectData(transform, variation, name, ) {
		let scope = this;
		if(variation === undefined) {
			variation = scope.getDefaultVariation()
		}
		if(name === undefined) {
			name = scope.getName()
		}
		if(transform === undefined) {
			transform = new LinearTransform()
		}
		return new ReferenceObjectData(scope.getReference(), variation, name, transform);
	}

	CreateEntry(folderName) {
		let blueprint = this;
		let entry = new UI.TableRow();
		let icon = new UI.Icon(blueprint.typeName);

		let cleanName;
		if(folderName === undefined) {
			cleanName = blueprint.getName();
		} else {
			cleanName = blueprint.name.replace(folderName, '');
		}
		let name = new UI.TableData(cleanName);

		entry.add(icon,name,new UI.TableData(blueprint.typeName));

		entry.setAttribute('draggable', true);
		entry.addClass("draggable");

		icon.addClass("jstree-icon favoritable");
		if(blueprint.favorited)
			icon.addClass("favorited");

		icon.dom.addEventListener('mouseover', function(e) {
			if(!blueprint.favorited) {
				icon.removeClass("favorited");
			}
		});

		icon.dom.addEventListener('click', function(e) {
			//Unfavorite
			if(blueprint.favorited) {
				editor.RemoveFavorite(blueprint);
				icon.removeClass("favorited");
			} else {
				//Favorite
				editor.AddFavorite(blueprint);
				icon.addClass("favorited")
			}
		});

		name.dom.addEventListener('click', function(e, data) {
			signals.spawnBlueprintRequested.dispatch(blueprint);
		});

		$(entry.dom).draggable({
			helper : function() {
				let helper = $(document.createElement("div"));
				helper.addClass("dragableHelper");
				return helper;
			},
			cursorAt: {
				top: 0,
				left: 0
			},
			appendTo: 'body',
			start: function(e) {
				editor.editorCore.onPreviewDragStart(blueprint)
			},
			drag: function(e) {
				editor.editorCore.onPreviewDrag(e)
			},
			stop: function(e) {
				editor.editorCore.onPreviewDragStop()
			}
		});

		return entry;
	}

}