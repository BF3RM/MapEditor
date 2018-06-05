class PowWindow {
    //TODO: z-index focus on title click.
    //Better resize-controls (They are a little small atm)
    //Make it beautiful

    constructor(id, title, element, hidden = false, height = 400, width = 300) {
        this.id = id;
        this.title = title;
        this.element = element;
        this.hidden = hidden;
        this.height = height;
        this.width = width;

        this.controls = null;
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
        if(this.hidden == true) {
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
        windowControls.append("<button>X</button>");
        this.windowControls = windowControls;

        if(this.element.controls != null) {
            let controls = this.element.controls;
            controls.addClass("controls");
            dom.append(controls);
            this.controls = controls;
        }


        let content = $(document.createElement("div"));
        dom.append(content);
        content.addClass("content scrollbar-outer");


        this.content = content;

        dom.resizable({
            handles: "n, e, s, w, ne, se, sw, nw",
            minHeight: 200,
            minWidth: 200,
            containment: "#page"
        });

        dom.draggable({
            handle: header,
            containment: "#page"
        });

        content.scrollbar();


        this.dom = dom;
        this.content.append(this.element.dom);

    }

    onTitleClick(e) {
        console.log(editor.ui.windowZ);
        editor.ui.windowZ++;
        $(this).css("z-index", editor.ui.windowZ);
    }
}