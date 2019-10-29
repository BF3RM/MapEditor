export var ViewPortComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	console.log(container.getElement().parent()[0]);
	let parents = container.getElement().parents();
	parents.addClass("viewPort");
	container.getElement().html( '<h2></h2>');
	/*
	container.getElement().droppable({
		accept: '.draggable',
		greedy:false,//this will prevent the parent droppables from receiving the droppable object
		drop: function (event, ui) {
			editor.editorCore.onPreviewDrop();
		},
		over: function(event, ui) {
			editor.editorCore.onPreviewStart();
		},
		out: function(event, ui) {
			editor.editorCore.onPreviewStop();
		},
	});
*/
};