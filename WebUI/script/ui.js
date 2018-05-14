$( "#menubar" ).menu({
	position: {at: "left bottom"},
	items: "> :not(.ui-widget-seperator)"
});

$('#worldView').selectmenu();

$('#tools input').checkboxradio({
	 icon: false
});

$('#worldSpace input').checkboxradio({
	 icon: false
});

$( "#inspector" ).draggable({
	handle: ".header",
	containment: "parent"  
}).resizable( {
	handles: "n, e, s, w, ne, se, sw, nw",
    minHeight: 200,
    minWidth: 200,
   	containment: "#page"

});