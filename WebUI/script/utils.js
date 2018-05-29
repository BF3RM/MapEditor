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
	var paths = path.split('/')
	paths.pop()
	return paths;
}

function getFilename(path) {
	return path.split("/").filter(function(value) {
		return value && value.length;
	}).reverse()[0];
}