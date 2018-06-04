class Inspector {
 	constructor(gameObject) {
        this.gameObject = gameObject;
        this.dom = null;
        this.transform = null;
        this.Initialize();

    }

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

		let transformControl = $(document.createElement("div"));
		content.append(transformControl);
		this.transform = {};


		let controls = ["Transform", "Rotation", "Scale"];
		let xyz = ["X","Y","Z"];
		let transform = this.transform;
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
                	"type": "number",
					"name": con+val,
					"id": con+val,
					"value": "0"
                });
                controller.append(inp);
                transform[con][val] = inp;

                //TODO: Link the values directly somehow?
            })
		});
		this.dom = content;
	}

	UpdateTransform(linearTransform) {
		//TODO this
	}
}

