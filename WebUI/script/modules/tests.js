/*

	Spawns random shit, hopefully no errors.

 */
function Test(count) {

	let randomBlueprint = function () {
		let keys = Object.keys(editor.blueprintManager.blueprints);
		let bp = editor.blueprintManager.getBlueprintByGuid(keys[ keys.length * Math.random() << 0]);
		return bp;

	};
	if(count === undefined) {
		count = 1;
	}
	for(let i = 0; i < count; i++) {
		let lt = new LinearTransform();
		lt.trans = new Vec3(getRandom(30),getRandom(30),getRandom(30));
		signals.spawnBlueprintRequested.dispatch(randomBlueprint(), lt);
	}

	console.log("Done");
}

function getRandom(max) {
	return Math.random() * Math.floor(max);
}