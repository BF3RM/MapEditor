/**
 * Reads real EBX from WebX (webx.powback.com) so the editor can run against a real game's data
 * with no game attached.
 *
 * WebX publishes the whole EBX as static JSON:
 *
 *     Games/<Game>/guidDictionary.json    partition guid -> "Levels\MP_001\MP_001"
 *     Games/<Game>/<Path>.json            one partition per file
 *
 * A partition is `{ $guid, $name, $primaryInstance, $instances[] }`, an instance is
 * `{ $guid, $type, $baseClass, $fields }`, and a reference field is
 * `{ $instanceGuid, $partitionGuid }` — the same `$array` / `$ref` / `$value` convention the
 * inspector already speaks.
 *
 * This is transport only: it knows how to fetch and resolve, and nothing about levels.
 *
 * Requests go to `/webx/...` rather than the host directly. WebX sends no
 * `Access-Control-Allow-Origin`, so a browser on the dev server cannot fetch it cross-origin; the
 * dev-server proxy in vue.config.js forwards that prefix. A same-origin deployment serves the
 * same paths, so nothing here changes between the two.
 */

export interface EbxRef {
	$instanceGuid: string;
	$partitionGuid: string;
}

export interface EbxInstance {
	$guid: string;
	$type: string;
	$baseClass?: string;
	$fields: Record<string, any>;
}

export interface EbxPartition {
	$guid: string;
	$name: string;
	$primaryInstance: string;
	$instances: EbxInstance[];
}

/** Simultaneous partition fetches. A level is hundreds of files and the host sends no gzip. */
const MAX_IN_FLIGHT = 8;

const CACHE_DB = 'webx-ebx';
const CACHE_STORE = 'partitions';

export class WebXSource {
	public readonly game: string;
	private readonly base: string;

	/** partition guid (lower) -> path, and the reverse. */
	private dictionary = new Map<string, string>();
	private pathToGuid = new Map<string, string>();

	private partitions = new Map<string, EbxPartition>();
	private instanceMaps = new Map<string, Map<string, EbxInstance>>();
	private inFlight = new Map<string, Promise<EbxPartition | null>>();

	private active = 0;
	private waiting: Array<() => void> = [];

	private db: IDBDatabase | null = null;

	public constructor(game = 'Venice', base = '/webx') {
		this.game = game;
		this.base = base;
	}

	/** Load the guid dictionary (7 MB) and open the cache. Call once before anything else. */
	public async open(): Promise<void> {
		this.db = await this.openCache();

		const response = await fetch(this.url('guidDictionary.json'));

		if (!response.ok) {
			throw new Error('WebX: no guidDictionary.json for game "' + this.game + '" (' + response.status + ')');
		}

		const raw = (await response.json()) as Record<string, string>;

		for (const guid of Object.keys(raw)) {
			// WebX stores Windows-style paths; everything downstream wants forward slashes.
			const path = raw[guid].replace(/\\/g, '/');
			const key = guid.toLowerCase();

			this.dictionary.set(key, path);
			this.pathToGuid.set(path.toLowerCase(), key);
		}
	}

	public get size(): number {
		return this.dictionary.size;
	}

	public pathForPartition(partitionGuid: string): string | undefined {
		return this.dictionary.get(partitionGuid.toLowerCase());
	}

	public guidForPath(path: string): string | undefined {
		return this.pathToGuid.get(path.replace(/\\/g, '/').toLowerCase());
	}

	/** Every level root, as EBX paths ("Levels/MP_001/MP_001"). */
	public levels(): string[] {
		const found: string[] = [];

		for (const path of this.dictionary.values()) {
			const parts = path.split('/');

			// A level root is Levels/<Map>/<Map> -- the partition named after its own directory.
			if (parts.length === 3 && parts[0] === 'Levels' && parts[1] === parts[2]) {
				found.push(path);
			}
		}

		return found.sort();
	}

	public async partitionByPath(path: string): Promise<EbxPartition | null> {
		const guid = this.guidForPath(path);

		return guid === undefined ? null : this.partition(guid);
	}

	/** Fetch a partition, or return the one already held. Concurrent calls share one request. */
	public async partition(partitionGuid: string): Promise<EbxPartition | null> {
		const key = partitionGuid.toLowerCase();
		const held = this.partitions.get(key);

		if (held !== undefined) {
			return held;
		}

		const pending = this.inFlight.get(key);

		if (pending !== undefined) {
			return pending;
		}

		const request = this.fetchPartition(key).finally(() => this.inFlight.delete(key));

		this.inFlight.set(key, request);

		return request;
	}

	/** Resolve a `{ $instanceGuid, $partitionGuid }` reference to the instance it names. */
	public async instance(ref: EbxRef | null | undefined): Promise<EbxInstance | null> {
		if (ref === null || ref === undefined || ref.$partitionGuid === undefined) {
			return null;
		}

		const partition = await this.partition(ref.$partitionGuid);

		return partition === null ? null : this.instanceIn(partition, ref.$instanceGuid);
	}

	public instanceIn(partition: EbxPartition, instanceGuid: string): EbxInstance | null {
		const key = partition.$guid.toLowerCase();
		let map = this.instanceMaps.get(key);

		if (map === undefined) {
			map = new Map<string, EbxInstance>();

			for (const instance of partition.$instances) {
				map.set(instance.$guid.toLowerCase(), instance);
			}

			this.instanceMaps.set(key, map);
		}

		return map.get(instanceGuid.toLowerCase()) ?? null;
	}

	public primaryInstance(partition: EbxPartition): EbxInstance | null {
		return this.instanceIn(partition, partition.$primaryInstance);
	}

	private url(suffix: string): string {
		return this.base + '/Games/' + this.game + '/' + suffix;
	}

	private async fetchPartition(key: string): Promise<EbxPartition | null> {
		const cached = await this.readCache(key);

		if (cached !== null) {
			this.partitions.set(key, cached);
			return cached;
		}

		const path = this.dictionary.get(key);

		if (path === undefined) {
			// Not an error worth throwing on: levels reference partitions that a given game dump
			// does not ship, and the walk has to carry on without them.
			return null;
		}

		const partition = await this.gate(async () => {
			const response = await fetch(this.url(path + '.json'));

			return response.ok ? ((await response.json()) as EbxPartition) : null;
		});

		if (partition !== null) {
			this.partitions.set(key, partition);
			void this.writeCache(key, partition);
		}

		return partition;
	}

	/** Hold the number of concurrent requests down; hundreds at once stalls the tab. */
	private async gate<T>(work: () => Promise<T>): Promise<T> {
		if (this.active >= MAX_IN_FLIGHT) {
			await new Promise<void>((resolve) => this.waiting.push(resolve));
		}

		this.active++;

		try {
			return await work();
		} finally {
			this.active--;

			const next = this.waiting.shift();

			if (next !== undefined) {
				next();
			}
		}
	}

	// --- cache -------------------------------------------------------------------------------
	//
	// A level is hundreds of uncompressed partitions, so a cold load is worth keeping. Every cache
	// path degrades to "no cache" rather than failing: private windows and blocked site data both
	// throw here, and the editor must still open.

	private openCache(): Promise<IDBDatabase | null> {
		return new Promise((resolve) => {
			try {
				const request = indexedDB.open(CACHE_DB, 1);

				request.onupgradeneeded = () => {
					if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
						request.result.createObjectStore(CACHE_STORE);
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => resolve(null);
			} catch (e) {
				resolve(null);
			}
		});
	}

	private readCache(key: string): Promise<EbxPartition | null> {
		return new Promise((resolve) => {
			if (this.db === null) {
				resolve(null);
				return;
			}

			try {
				const request = this.db
					.transaction(CACHE_STORE, 'readonly')
					.objectStore(CACHE_STORE)
					.get(this.cacheKey(key));

				request.onsuccess = () => resolve((request.result as EbxPartition) ?? null);
				request.onerror = () => resolve(null);
			} catch (e) {
				resolve(null);
			}
		});
	}

	private writeCache(key: string, partition: EbxPartition): Promise<void> {
		return new Promise((resolve) => {
			if (this.db === null) {
				resolve();
				return;
			}

			try {
				const store = this.db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE);
				const request = store.put(partition, this.cacheKey(key));

				request.onsuccess = () => resolve();
				request.onerror = () => resolve();
			} catch (e) {
				resolve();
			}
		});
	}

	private cacheKey(key: string): string {
		return this.game + ':' + key;
	}
}
