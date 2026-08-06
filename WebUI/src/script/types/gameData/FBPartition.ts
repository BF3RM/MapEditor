import { Guid } from '@/script/types/Guid';
import { getFilename, getPaths } from '@/script/modules/Utils';
import { AxiosResponse } from 'axios';
import Partition from '@/script/types/ebx/Partition';
import Instance from '@/script/types/ebx/Instance';
import { Dictionary } from 'typescript-collections';
import { GameObject } from '@/script/types/GameObject';
import Vue from 'vue';
const axios = require('axios').default;

// --- Live in-game partition transport (server serializer over NetEvents) ---
// In-game there is no webx: the EBX partition JSON is produced live by the server
// (ext/Server/PartitionSerializer.lua). The client bridge (ext/Client/PartitionInspector.lua)
// forwards MapEditor:RequestPartitionData to the server, which streams the serialized
// partition back and calls these globals. window.vext.SendEvent handles the emulator/in-game
// split, but this path only runs in-game (see getData's !editor.debug branch).
interface IPendingPartition {
    resolve: (json: EBX.JSON.Partition) => void;
    reject: (e: any) => void;
}
const g: any = window as any;
if (!g.__ebxPending) {
    g.__ebxPending = {};
    g.__ebxReqId = 0;
    g.__onPartitionData = (id: number, jsonStr: string) => {
        const p: IPendingPartition = g.__ebxPending[id];
        if (!p) { return; }
        delete g.__ebxPending[id];
        try {
            p.resolve(JSON.parse(jsonStr));
        } catch (e) {
            p.reject(e);
        }
    };
    g.__onPartitionError = (id: number, msg: string) => {
        const p: IPendingPartition = g.__ebxPending[id];
        if (!p) { return; }
        delete g.__ebxPending[id];
        p.reject(new Error(msg));
    };
}

function requestPartitionFromGame(guid: string, name: string): Promise<EBX.JSON.Partition> {
    const requestId = ++g.__ebxReqId;
    const promise = new Promise<EBX.JSON.Partition>((resolve, reject) => {
        g.__ebxPending[requestId] = { resolve, reject };
        // A lost reply must not wedge the inspector on "Loading..." forever.
        setTimeout(() => {
            if (g.__ebxPending[requestId]) {
                delete g.__ebxPending[requestId];
                reject(new Error('Partition request timed out: ' + name));
            }
        }, 15000);
    });
    window.vext.SendEvent('RequestPartitionData', { requestId, guid, name });
    return promise;
}

export class FBPartition {
    public typeName: string;
    public instanceCount: number;
    public _data: any = undefined;
    public isLoaded = false;

    private promise: Promise<AxiosResponse<EBX.JSON.Partition>>;
    constructor(
        public name: string,
        public guid: Guid,
        public primaryInstanceGuid: Guid | null = null,
        public instances: { [guid: string]: Instance } = {}
    ) { }

    get primaryInstance(): Instance | null {
        if (this.primaryInstanceGuid) {
            return this.instances[this.primaryInstanceGuid.toString().toLowerCase()];
        }
        return null;
    }

    get bundlesReferencedIn() {
        return editor.fbdMan.getBundlesReferencedIn(this.name);
    }

    get paths() {
        return getPaths(this.name);
    }

    get id() {
        return this.guid.toString();
    }

    get fileName() {
        return getFilename(this.name);
    }

    public get data() {
        if (this.promise) {
            // In case the same thing is requested rapidly
            return this.promise;
        }
        return this.getData();
    }

    // Load the partition's instances from JSON, wire up the primary instance, and mark
    // loaded. Shared by both the browser (webx/proxy) and in-game (live serializer) paths.
    // Instances are keyed lowercase to match getInstance()/primaryInstance lookups — the
    // server serializer returns uppercase GUIDs, so this can't be skipped.
    private ingest(json: EBX.JSON.Partition): Partition {
        const data = Partition.fromJSON(this.name, json);
        // register-on-demand partitions are created without a primary-instance guid;
        // the JSON carries it, so adopt it once the data actually arrives.
        if (!this.primaryInstanceGuid && json.$primaryInstance) {
            this.primaryInstanceGuid = new Guid(json.$primaryInstance);
        }
        for (const instance of json.$instances) {
            this.isLoaded = true;
            Vue.set(this.instances, instance.$guid.toLowerCase(), Instance.fromJSON(this._data, instance));
        }
        return data;
    }

    public getData(): Promise<AxiosResponse<EBX.JSON.Partition>> {
        if (this.promise) {
            // In case the same thing is requested rapidly
            return this.promise;
        }
        if (editor.debug) {
            // Browser dev: no game to ask, so pull the prebaked JSON from the local CORS
            // proxy (localhost) or webx directly.
            this.promise = axios
                .get((location.hostname === 'localhost' ? 'http://localhost:8899/' : 'https://webx.powback.com/Games/Venice/') + this.name + '.json')
                .then((response: AxiosResponse<EBX.JSON.Partition>) => this.ingest(response.data))
                .catch((e: any) => {
                    console.error(e);
                });
        } else {
            // In-game: request live serialization from the server over the NetEvent bridge.
            // (Cast: the resolved value is ignored by the GameObject.partition getter, which
            // returns the FBPartition itself — same as the axios/any path above.)
            this.promise = requestPartitionFromGame(this.guid.toString(), this.name)
                .then((json: EBX.JSON.Partition) => this.ingest(json))
                .catch((e: any) => {
                    console.error(e);
                }) as unknown as Promise<AxiosResponse<EBX.JSON.Partition>>;
        }
        return this.promise;
    }

    public getInstance(guid: Guid): Instance {
        return this.instances[guid.toString().toLowerCase()];
    }
}
