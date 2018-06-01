var delay = (function() {
	var timer = 0;
	return function(callback, ms) {
		clearTimeout(timer);
		timer = setTimeout(callback, ms);
	};
})();


function hasLowerCase(str) {
	return (/[a-z]/.test(str));
}

function hasUpperCase(str) {
	return (/[A-Z]/.test(str));
}


function getPaths(path) {
	var paths = path.split('/');
	paths.pop();
	return paths;
}

function getFilename(path) {
	return path.split("/").filter(function(value) {
		return value && value.length;
	}).reverse()[0];
}

function GenerateGuid() {
	var S4 = function() {
		return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
	};
	return ("ed170120"+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}
