class PowWindow {
    constructor(id, title, element, height = 400, width = 300) {
        this.id = id;
        this.title = title;
        this.controls = null;
        this.header = null;
        this.windowControls = null;
        this.content = null;
        this.element = element;

        this.height = height;
        this.width = width;

        this.dom = null;
        this.Initialize();
    }

    Initialize() {
        let dom =  $(document.createElement("div"));
        dom.addClass("window");
        dom.attr('id', this.id);
        dom.css({
            "height": this.height,
            "width": this.width,
        });

        let header = $(document.createElement("div"));
        dom.append(header);
        header.addClass("header");
        this.header = header;

        let title = $(document.createElement("h1"));
        header.append(title);
        title.text(this.title);
        this.title = title;

        let windowControls = $(document.createElement("div"));
        header.append(windowControls);
        windowControls.addClass("windowControls");
        windowControls.append("<button>X</button>");
        this.windowControls = windowControls;


        let controls = this.element.controls;
        controls.addClass("controls");
        dom.append(controls);
        this.controls = controls;

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
}