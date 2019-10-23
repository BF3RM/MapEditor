export class DebugWindow {
	constructor() {
		this.dom = null;;
		this.topControls = this.CreateTopControls();
		this.debugBox = null;
		this.Initialize();
	}

	Initialize() {
		this.dom = $(document.createElement("div"));
		this.dom.css({
			"height": "99%",
			"width": "99%"
		});


	}

	Update() {
		if(editor == null) {
			console.log("Unable to find editor");
			return;
		}
		this.dom.html(renderjson(JSON.parse(
			JSON.stringify(editor.rootEntities, function( key, value) {
				if(key == 'parent'){
					if (value != null) {
						return value.id;
					}
					else{
						return null;
					}
				}else{
					return value;
				}
			}
			))));
	}

	CreateTopControls() {
		let control = $(document.createElement("button"));
		control.text("Update");
		control.on('click', function() {
			editor.ui.UpdateUI()
		});
		return(control)
	}
}