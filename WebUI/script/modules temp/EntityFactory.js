/*

	This class is responsible for all entity manipulation.
	Including moving/adding/deleting etc.


 */
class EntityFactory {
	constructor() {
		this.gameObjects = {}; // Spawned gameObjects
	}


	getGameObjectByGuid(guid) {
		let go = this.gameObjects[guid];
		if( go === undefined) {
			editor.logger.LogError("Tried to access a null GameObject" + guid);
		}
		return go;
	}
}