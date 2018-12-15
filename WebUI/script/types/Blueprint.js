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

	CreateEntry(folderName) {
		let blueprint = this;
		let entry = $(document.createElement("tr"));
		let icon = $(document.createElement("i"));
		let name = $(document.createElement("td"));
		let type = $(document.createElement("td"));
		entry.append(icon);
		entry.append(name);
		entry.append(type);
		icon.addClass("jstree-icon favoritable");
		if(blueprint.favorited)
			icon.addClass("favorited");

		icon.addClass(blueprint.typeName);
		if(folderName === undefined) {
			name.html(blueprint.getName());
		} else {
			name.html(blueprint.name.replace(folderName, ''));
		}
		type.html(blueprint.typeName);
		icon.on('mouseover', function(e) {
			if(!blueprint.favorited) {
				icon.removeClass("favorited");
			}
		});

		icon.on('click', function(e) {
			//Unfavorite
			if(icon.hasClass("favorited")) {
				editor.RemoveFavorite(blueprint);
				icon.removeClass("favorited");
			} else {
				//Favorite
				editor.AddFavorite(blueprint);
				icon.addClass("favorited")
			}
			signals.favoritesChanged.dispatch();
		});

		name.on('click', function(e, data) {
			signals.spawnBlueprintRequested.dispatch(blueprint);
		});
		return entry;
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

}