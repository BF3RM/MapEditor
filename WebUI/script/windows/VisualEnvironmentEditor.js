// String.format(), courtesy of https://journalofasoftwaredev.wordpress.com/2011/10/30/replicating-string-format-in-javascript/
String.prototype.format = function()
{
    /*
    String.format() https://en.wikipedia.org/wiki/String_interpolation

    returns a templated string in which the placeholders are replaced with their corresponding values
    Example
    -----------
    "{0} {1}".format("Hello", "world");
    Hello world
    */
   var content = this;
   for (var i=0; i < arguments.length; i++)
   {
        var replacement = '{' + i + '}';
        content = content.replace(replacement, arguments[i]);
   }
   return content;
};

class VisualEnvironmentEditor {
	constructor() {
		this.dom = null;
		this.transform = null;
		this.name = null;
		this.variation = null;
		this.enabled = false;
		this.Initialize();
	}

	Initialize () {
	    let content = $(document.createElement("div"));
		content.attr("id", "objectVisualEnvironmentEditor");

		let categoryControl = $(document.createElement("div"));
        categoryControl.addClass("category");

		let categoryLabel = $(document.createElement("label"));
		categoryLabel.attr("for", "objectCategory");
		categoryLabel.text("Category");
        categoryControl.append(categoryLabel);


		let categorySelect = $(document.createElement("select"));
		categoryControl.append(categorySelect);
		categorySelect.attr({
			"id": "objectCategory",
			"type": "select",
			"value": "category"
		});

		function getControlGroupContent(category){
		    /*
		    This function returns the content for the selected category option
		    */

		    let controlGroupContent = "TODO: Display category control group for the {0} category";
		    let controlGroupMap = new Map([
		        ["Info", "CinematicTools Yo"]
		    ]);

		    if (controlGroupMap.has(category)) {
		        controlGroupContent = controlGroupMap.get(category);
		    }
		    else {
		        if (category === null) {
                    category = "selected";
                }
                controlGroupContent = controlGroupContent.format(category);
		    }

		    return controlGroupContent;
		}
		let categoryOptions = ["Info", "Presets"];
		let supportedCategories = [
            "CameraParams",
            "CharacterLighting",
            "ColorCorrection",
            "DamageEffect",
            "Dof",
            "DynamicAO",
            "DynamicEnvmap",
            "Enlighten",
            "FilmGrain",
            "Fog",
            "LensScope",
            "MotionBlur",
            "OutdoorLight",
            "PlanarReflection",
            "ScreenEffect",
            "Sky",
            "SunFlare",
            "Tonemap",
            "Vignette",
            "Wind"
		];

        // optionLabel will be the category name passed to getControlGroupMap()
        let optionLabel = null;
        // Append supportedCategories to categoryOptions
		categoryOptions.push.apply(categoryOptions, supportedCategories);
		for(let i = 0; i < categoryOptions.length; i++){
		    let option = document.createElement("option");

            optionLabel = categoryOptions[i];
            option.value = optionLabel;
            if (optionLabel == null){
                option.value = (i+1).toString();
                optionLabel = "sample" + option.value;
		    }
            option.innerHTML = optionLabel;
            categorySelect.append(option);
        }
        content.append(categoryControl);

        let categoryControlGroup = $(document.createElement("div"));
        categoryControlGroup.addClass("category-control-group");
        let categoryControlGroupText = $(document.createElement("span"));
        categoryControlGroupText.text(getControlGroupContent("Info"));
        categoryControlGroupText.addClass("category-control-group");
		categoryControlGroup.append(categoryControlGroupText);
		content.append(categoryControlGroup);

		this.category = categorySelect;

		$(categorySelect).on('change',function(event){
            // $this is the categorySelect element that fired the change event
            let $this = this;
            categoryControlGroupText.text(getControlGroupContent($this.value));
			if (editor.selectionGroup.children.length === 0){ return;}
			editor.execute(new SetObjectNameCommand(editor.selectionGroup.children[0].guid, this.value));
		});

		this.dom = content;
	}
}

var VisualEnvironmentEditorComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new VisualEnvironmentEditor();

	this._container.getElement().html(this.element.dom);
};
