$("#menubar").menu({
	position: {
		at: "left bottom"
	},
	items: "> :not(.ui-widget-seperator)"
});

$('#worldView').selectmenu({
	change: worldViewChanged
});

$('#tools').find('input').checkboxradio({
	icon: false
}).on("change", toolsChanged);

$('#worldSpace').find('input').checkboxradio({
	icon: false
}).on("change", worldChanged);


jQuery('.scrollbar-outer').scrollbar();

$('.window').each(function() {
	$(this).resizable({
		handles: "n, e, s, w, ne, se, sw, nw",
		minHeight: 200,
		minWidth: 200,
		containment: "#page",
		alsoResize: $(this).find('.scroll-wrapper'),
	});

	$(this).draggable({
		handle: $(this).find('.header'),
		containment: "#page"
	})

});

variationDialog = $("#variation-dialog").dialog({
	autoOpen: false,
	height: "auto",
	width: "auto",
	modal: true,
	buttons: {
		"Spawn object!": ConfirmInstanceSpawn,
		Cancel: function() {
			variationDialog.dialog("close");
		}
	},
	close: function() {
		variationDialog.dialog("close");
	}
});


function toolsChanged(e) {
	SetGizmoMode(e.target.id);
}

function worldChanged(e) {
	SetWorldSpace(e.target.id);
}

function worldViewChanged(e, ui) {
	SendEvent('DispatchEventLocal', 'MapEditor:SetViewmode', ui.item.value)
}