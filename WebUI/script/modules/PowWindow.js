class PowWindow {
	//TODO: z-index focus on title click.
	//Better resize-controls (They are a little small atm)
	//Make it beautiful

	constructor(id, title, element, visible = true, height = 400, width = 300) {
		this.id = id;
		this.title = title;
		this.element = element;
		this.visible = visible;
		this.height = height;
		this.width = width;

		this.topControls = null;
		this.subControls = null;
		this.header = null;
		this.windowControls = null;
		this.content = null;



		this.dom = null;
		this.Initialize();
	}

	Initialize() {
		let dom =  $(document.createElement("div"));
		dom.addClass("window");
		dom.attr('id', this.id);
		dom.css({
			"height": this.height,
			"width": this.width
		});
		if(this.visible == false) {
			dom.css("display", "none");
		}

		let header = $(document.createElement("div"));
		dom.append(header);
		header.addClass("header");
		this.header = header;
		dom.on('mousedown', this.onTitleClick);

		let title = $(document.createElement("h1"));
		header.append(title);
		title.text(this.title);
		this.title = title;

		let windowControls = $(document.createElement("div"));
		header.append(windowControls);
		windowControls.addClass("windowControls");

		let btn = $(document.createElement("BUTTON"));
		let t = document.createTextNode("X");
		btn.append(t);
		btn.click({id: this.id}, function(e){
			$("#" + e.data.id).toggle();
		});

		windowControls.append(btn);
		this.windowControls = windowControls;

		if(this.element.topControls != null) {
			let topControls = this.element.topControls;
			topControls.addClass("topControls");
			dom.append(topControls);
			this.topControls = topControls;
		}


		let content = $(document.createElement("div"));
		dom.append(content);
		content.addClass("content scrollbar-outer");


		this.content = content;

		dom.resizable({
			handles: "n, e, s, w, ne, se, sw, nw",
			minHeight: 200,
			minWidth: 200,
			containment: "#page",
			// Hack to make sure the canvas doesn't catch our mouseover.
			start: function( event, ui ) {
				$('#page').find('canvas').css("z-index", -1);
			},
			stop: function( event, ui ) {
				$('#page').find('canvas').css("z-index", 0);
			},
		});

		dom.draggable({
			handle: header,
			containment: "#page",
			
			// Hack to make sure the canvas doesn't catch our mouseover.
			start: function( event, ui ) {
				$('#page').find('canvas').css("z-index", -1);
			},
			stop: function( event, ui ) {
				$('#page').find('canvas').css("z-index", 0);
			},
		});

		content.scrollbar();


		this.dom = dom;
		this.content.append(this.element.dom);

		if(this.element.subControls != null) {
			let subControls = this.element.subControls;
			subControls.addClass("subControls");
			dom.append(subControls);
			this.subControls = subControls;
		}

	}

	onTitleClick(e) {
		editor.ui.windowZ++;
		$(this).css("z-index", editor.ui.windowZ);
	}

	Show() {
		editor.ui.windowZ++;
		this.dom.css("z-index", editor.ui.windowZ);
		this.dom.show();
	}
	Hide() {
		this.dom.hide();
	}
	Toggle() {
		editor.ui.windowZ++;
		this.dom.css("z-index", editor.ui.windowZ);
		this.dom.toggle();
	}
}