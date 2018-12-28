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

		let categoryOptions = new Array(19);
		categoryOptions[0] = 'Info'
		categoryOptions[1] = 'Presets'
		for(let i = 0; i < categoryOptions.length; i++){
		    let option = document.createElement("option");

            option.value = (i+1).toString();
            let option_label = categoryOptions[i];
            if (option_label == null){
                option_label = "sample" + option.value;
		    }
            option.innerHTML = option_label
            categorySelect.append(option)
        }
        content.append(categoryControl);

        let categoryControlGroup = $(document.createElement("div"));
        categoryControlGroup.addClass("category-control-group");
        let categoryControlGroupText = $(document.createElement("span"));
        categoryControlGroupText.text("TODO: Display category control group for the selected category");
        categoryControlGroupText.addClass("category-control-group");
		categoryControlGroup.append(categoryControlGroupText);
		content.append(categoryControlGroup);

		this.category = categorySelect;

		$(categorySelect).on('change',function(){
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
