class Inspector {
 	constructor() {
        this.dom = null;
        this.transform = null;
        this.name = null;
        this.Initialize();

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

		let transformControl = $(document.createElement("div"));
		transformControl.addClass("transform");
		content.append(transformControl);
		this.transform = {};

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
                inp.on('change', this.UpdateTransform);
                transform[con][val] = inp;

                //TODO: Link the values directly somehow?
            })
		});
		this.dom = content;
	}

	UpdateTransform(linearTransform) {
		//TODO this
	}

	UpdateInspector(gameObject) {
 		if(gameObject == null) {
 			console.log("Tried to update the inspector with an invalid gameobject?")
			return
		}
 		console.log(gameObject)
 		this.name[0].value = gameObject.name;

        let controls = ["position", "rotation", "scale"];
        let xyz = ["x","y","z"];
        let transform = this.transform;
        $.each(controls, function (index, con) {
        	let control = gameObject.webObject[con];
        	if(con == controls[1]) {
				control = new THREE.Euler().setFromQuaternion( gameObject.webObject.quaternion, "XYZ" );
			}
			console.log(control);
            $.each(xyz, function(index2, val) {
                if(con == controls[1]) {
                    transform[con][val][0].value = Math.round( ( control[val]*180/Math.PI ) * -1 * 1000) / 1000;
                } else {
                    transform[con][val][0].value = Math.round( control[val] * 1000) / 1000;
				}
            });
		});
	}
}

