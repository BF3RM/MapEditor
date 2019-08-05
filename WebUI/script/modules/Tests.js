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
	let commands = [];
	for(let i = 0; i < count; i++) {
		let lt = new LinearTransform();
		lt.trans = new Vec3(getRandom(30),getRandom(30),getRandom(30));

		let bp = randomBlueprint();
        let transferData = new GameObjectTransferData();
        transferData.transform = new LinearTransform();
        transferData.transform.trans.x = Math.random() * 10;
        transferData.transform.trans.z = Math.random() * 10;
        transferData.blueprintCtrRef = bp.getCtrRef();
        transferData.guid = GenerateGuid();
        transferData.name = bp.name;
        transferData.parentData = new GameObjectParentData();

        commands[i] = new SpawnBlueprintCommand(transferData);
	}
	let command = new BulkCommand(commands);
	editor.execute(command);
	console.log("Done");
}

function getRandom(max) {
	return Math.random() * Math.floor(max);
}