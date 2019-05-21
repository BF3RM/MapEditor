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

	return ("ED170121"+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

Math.clamp = function (value, min, max) {

	if (value < min) {
		return min;
	}
	else if (value > max) {
		return max;
	}

	return value;
};


Math.lerp = function (value1, value2, amount) {
	amount = amount < 0 ? 0 : amount;
	amount = amount > 1 ? 1 : amount;
	return (1 - amount) * value1 + amount * value2;
};

// *-1 for right handedness
function FromEuler(value) {
	return ((value/180)*Math.PI ) * -1
}

function ToEuler(value) {
	return ((value*180)/Math.PI ) * -1
}


//https://stackoverflow.com/questions/7837456/how-to-compare-arrays-in-javascript
// Warn if overriding existing method
if(Array.prototype.equals)
	console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
	// if the other array is a falsy value, return
	if (!array)
		return false;

	// compare lengths - can save a lot of time
	if (this.length != array.length)
		return false;

	for (let i = 0, l=this.length; i < l; i++) {
		// Check if we have nested arrays
		if (this[i] instanceof Array && array[i] instanceof Array) {
			// recurse into the nested arrays
			if (!this[i].equals(array[i]))
				return false;
		}
		else if (this[i] !== array[i]) {
			// Warning - two different object instances will never be equal: {x:20} != {x:20}
			return false;
		}
	}
	return true;
};
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

function iterationCopy(src) {
	let target = {};
	for (let prop in src) {
		if (src.hasOwnProperty(prop)) {
			target[prop] = src[prop];
		}
	}
	return target;
}