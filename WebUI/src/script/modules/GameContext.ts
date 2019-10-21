import * as Collections from 'typescript-collections';
import {Guid} from "guid-typescript";

export default class GameContext {
    levelData: Collections.Dictionary<Guid, GameObject>;
    constructor() {
        this.levelData = new Collections.Dictionary<Guid, GameObject>();
    }

    LoadLevel(levelRaw:string) {
        let levelData = JSON.parse(levelRaw);
        this.levelData.setValue(levelData.instanceGuid, levelData);
        signals.levelLoaded.dispatch(levelData);
        //signals.levelLoaded.dispatch(this.data);
    }
}
