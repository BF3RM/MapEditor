import * as Collections from 'typescript-collections';
import { Guid } from '@/script/types/Guid';
import { GameObject } from '@/script/types/GameObject';
import { signals } from '@/script/modules/Signals';

export default class GameContext {
	public levelData: Collections.Dictionary<Guid, GameObject>;

	constructor() {
		this.levelData = new Collections.Dictionary<Guid, GameObject>();
	}

	public LoadLevel(levelRaw: string) {
		const levelData = JSON.parse(levelRaw);
		this.levelData.setValue(levelData.instanceGuid, levelData);
		signals.levelLoaded.emit(levelData);
		// signals.levelLoaded.dispatch(this.data);
	}
}
