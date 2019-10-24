import * as Collections from 'typescript-collections';
import {Guid} from 'guid-typescript';
import {GameObject} from '@/script/types/GameObject';

export default class GameContext {
	public levelData: Collections.Dictionary<Guid, GameObject>;
	constructor() {
		this.levelData = new Collections.Dictionary<Guid, GameObject>();
	}

	public LoadLevel(levelRaw: string) {
		const levelData = JSON.parse(levelRaw);
		this.levelData.setValue(levelData.instanceGuid, levelData);
		signals.levelLoaded.dispatch(levelData);
		// signals.levelLoaded.dispatch(this.data);
	}
}
