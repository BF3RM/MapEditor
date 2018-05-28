var treeView = {
  "type": "folder",
  "text": "Venice",
  "state" : {
    "opened" : true,
    "selected" : true,
  },
  "children": []
};

function InitializeTreeView(instances) {
	ParseStructure(instances);
	$('#jstree').jstree({
	    "types": {
	 		"folder" : {
	            "icon" : "jstree-folder"
	        },
	        "file" : {
	            "icon" : "jstree-file"
	        }
	    },
	    "plugins": ["types", "sort", "json_data", "search"],
	    "search": {

            "case_insensitive": true,
            "show_only_matches" : true
        },
	    "sort" : function(a, b) {
	    				a1 = this.get_node(a);
	            b1 = this.get_node(b);
	            if (a1.icon == b1.icon){
	                return (a1.text.toLowerCase() > b1.text.toLowerCase()) ? 1 : -1;
	            } else {
	            	return (a1.icon < b1.icon) ? 1 : -1;
	            }
	    },
		'core' : {
		     'data' : [treeView]
		}
	});
    $(".search-input").keyup(function() {
		var searchString = $(this).val();
	    delay(function(){
			console.log(searchString);
			$('#jstree').jstree('search', searchString);
	    }, 500 );
        
    });
	$('#jstree')
	  // listen for event
	  .on('changed.jstree', function (e, data) {
	  	if(data.node == null) {
	  		return
	  	}
	    var id = data.node.original.id
	    if(id != null) {
	    	PrepareInstanceSpawn(id);
	    }
	  })
	
}

var delay = (function(){
  var timer = 0;
  return function(callback, ms){
    clearTimeout (timer);
    timer = setTimeout(callback, ms);
  };
})();

function SpawnInstance(id) {
	console.log("SPAWNING " + id)
}
function hasLowerCase(str) {
    return (/[a-z]/.test(str));
}

function hasUpperCase(str) {
    return (/[A-Z]/.test(str));
}
function ParseStructure(table) {
	var ret = {}
	for (var key in table) {
		var instance = table[key]; 
		var path = instance.name;
		var paths = getPaths(path);
		var parentPath = treeView;
		var fileName = getFilename(path)
		paths.forEach(function(subPath) {
			var parentIndex = parentPath.children.find(x => x.text.toLowerCase() === subPath.toLowerCase());
			if( parentIndex === undefined) {
				var a = parentPath.children.push({
					"type": "folder",
					"text": subPath,
					"children": []
				})
				parentPath = parentPath.children[a - 1];
			} else {
				parentPath = parentIndex
				// Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
				// Replace lowercase paths with the actual case.
				if(hasUpperCase(subPath) && hasLowerCase(parentPath.text)) {
					parentPath.text = subPath;
				}
			}
		});
		parentPath.children.push({
			"type": "file",
			"text": fileName,
			"id": instance.instanceGuid
		})
	}

}
function getPaths(path) {
	var paths = path.split( '/' )
	paths.pop()
	return paths;
}

function getFilename(path) {
    return path.split("/").filter(function(value) {
        return value && value.length;
    }).reverse()[0];
}



/*

{
  "type": "folder",
  "text": "Venice",
  "state" : {
    "opened" : true
  },
  "children": [
    {
      "type": "folder",
      "text": "AI",
      "children": [
        {
          "type": "file",
          "text": "AISystem.ebx"
        },
        {
          "type": "folder",
          "text": "AI_Templates",
          "children": [
            {
              "type": "folder",
              "text": "Behaviour_Templates",
              "children": [
                {
                  "type": "file",
                  "text": "Behavior_Enemy_Assault.ebx"
                }]
*/