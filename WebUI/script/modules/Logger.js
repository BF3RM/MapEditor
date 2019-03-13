var logLevel = LOGLEVEL.VERBOSE;

function LogError(message) {
	console.error(message)
}
function Log(level, message) {
	if(typeof (level) != "number") {
		LogError("Log statement is missing level. Consider fixing that.");
		console.log(level);
		return false;
	}
	if(level <= logLevel) {
		console.log(message)
	}
}
