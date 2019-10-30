import { signals } from '@/script/modules/Signals';
import { Guid } from 'guid-typescript';
import * as JSZip from 'jszip';
import { JSZipUtils } from '@/script/libs/jszip-utils';
import { getFilename, getPaths } from '@/script/modules/Utils';

export class FrostbiteDataManager {
	private superBundles: { all: FBSuperBundle };
	private bundles: { all: FBBundle };
	private partitions: object;
	private _files: object;
	private _data: object;

	constructor() {
		// this.window = new ImportWindow();

		this.superBundles = {
			all: new FBSuperBundle({
				name: 'all',
				chunkCount: 0,
				bundleCount: 0
			})
		};
		this.bundles = {
			all: new FBBundle({
				name: 'all',
				partitionCount: 0,
				size: 0
			})
		};
		this.partitions = {};

		this._files = {};
		this._data = {};

		signals.editorInitializing.connect(this._onEditorInitializing.bind(this));
		signals.editorReady.connect(this._onEditorReady.bind(this));

		// this._Init();
	}

	public _Init() {
		const scope = this;
		const jszu = new JSZipUtils();
		jszu.getBinaryContent('data/data.zip', function(err: any, data: any) {
			if (err) {
				throw err; // or handle err
			}
			JSZip.loadAsync(data).then(function(zip) {
				scope._data = zip;
				scope._ExtractFiles();
			});
		});
	}

	public _onEditorInitializing() {
		// editor.ui.RegisterWindow("ImportWindow", "Import bundle", this.window, false);
	}

	public _onEditorReady() {
		/* let scope = this;

		editor.ui.RegisterMenubarEntry(["Edit", "Import"], function () {
			editor.ui.OpenWindow("importwindow");
			scope.window.dom.dispatchEvent(new Event('resize')); // fix GoldenLayout having invalid sizes
			scope.window.Update();
		} );

		 */
	}

	public _ExtractFiles() {
		/*
		const scope = this;
		if (scope._data === null) {
			return false;
		}
		Object.keys(scope._data.files).forEach(function(fileNameJson) {
			// Add filetype check here maybe?
			const fileName = fileNameJson.replace('.json', '');
			scope._data.file(fileNameJson).async('string').then(function(text) {
				scope._files[fileName.toLowerCase()] = JSON.parse(text);
				console.log('Loading ' + fileName);
				scope._HandleFile(fileName.toLowerCase());
			});
		});
		 */
	}

	public async _HandleFile(fileName: string) {
		/*
		p_FileName = p_FileName.toLowerCase();
		const scope = this;
		const file = scope._files[p_FileName];
		Object.keys(file).forEach(function(entryName) {
			const entry = file[entryName];
			switch (p_FileName) {
				case 'superbundles':
					scope.superBundles[entryName] = new FBSuperBundle(entry);
					break;
				case 'bundles':
					scope.bundles[entryName] = new FBBundle(entry);
					break;
				case 'partitions':
					scope.partitions[entryName] = new FBPartition(entry);
					break;
				default:
				// code block
			}
		});
		console.log('Loaded ' + p_FileName);
		 */
	}

	public getBundle(path: string) {
		/*
		return this.bundles[path];
		 */
	}

	public getSuperBundles() {
		/*
		const scope = this;
		const superBundles = {};
		Object.keys(scope._files.superbundles).forEach(function(superBundleName) {
			superBundles[superBundleName] = scope.superBundles[superBundleName];
		});
		return superBundles;

		 */
	}

	public getBundles(superBundleName?: string) {
		/*
		const scope = this;
		const bundles = [];

		if (p_SuperBundleName === undefined || p_SuperBundleName.toLowerCase() === 'all') {
			return scope.bundles;
		} else if (scope.superBundles[p_SuperBundleName.toLowerCase()] !== undefined) {
			const bundlesRaw = scope.getBundlesRaw(p_SuperBundleName);
			Object.values(bundlesRaw).forEach((bundle) => {
				bundles.push(scope.getBundle(bundle));
			});
		}
		return bundles;

		 */
	}

	public getBundlesRaw(superBundleName?: string) {
		/*
		const scope = this;
		return scope._files.superbundles[p_SuperBundleName.toLowerCase()].bundles;

		 */
	}

	public getPartition(partitionName: string) {
		// return this.partitions[p_PartitionName.toLowerCase()];
	}

	public getSuperBundle(superBundleName: string) {
		// return this.superBundles[p_SuperBundleName.toLowerCase()];
	}

	public getPartitions(bundleName?: string) {
		/*
		const scope = this;
		const partitions = {};

		if (p_BundleName === undefined || p_BundleName.toLowerCase() === 'all') {
			Object.keys(scope._files.bundles).forEach(function(bundleName) {
				const bundle = scope._files.bundles[bundleName.toLowerCase()];
				Object.values(bundle.partitions).forEach(function(partitionName) {
					const partition = scope.getPartition(partitionName);
					if (partition !== undefined) {
						partitions[partitionName] = scope.partitions[partitionName];
					}
				});
			});
		} else if (scope._files.bundles[p_BundleName.toLowerCase()] !== undefined) {
			const bundle = scope._files.bundles[p_BundleName.toLowerCase()];
			Object.values(bundle.partitions).forEach(function(partitionName) {
				const partition = scope.getPartition(partitionName);
				if (partition !== undefined) {
					partitions[partitionName] = scope.partitions[partitionName];
				}
			});
		} else {
			for (const key of Object.keys(scope._files.bundles)) {
				if (key.startsWith(p_BundleName)) {
					const bundle = scope._files.bundles[key];
					Object.values(bundle.partitions).forEach( (partitionName) => {
						const partition = scope.getPartition(partitionName);
						if (partition !== undefined) {
							partitions[partition.name] = partition;
						}
					});
				}
			}
		}
		return partitions;
		 */
	}

	public getBundlesReferencedIn(partitionName: string) {
		/*
		const superBundle = this._files.partitions[p_PartitionName.toLowerCase()];
		return superBundle.bundlesReferencedIn;

		 */
	}
}

export class FBSuperBundle {
	public name: string;
	public chunkCount: number;
	public bundleCount: number;

	constructor(superBundleData: any) {
		this.name = superBundleData.name;
		this.chunkCount = superBundleData.chunkCount;
		this.bundleCount = superBundleData.bundleCount;
	}

	get bundles() {
		const scope = this;
		if (this.name === 'All') {
			return editor.fbdMan.getBundles();
		}
		return editor.fbdMan.getBundles(this.name);
	}

	get paths() {
		return getPaths(this.name);
	}

	get fileName() {
		return getFilename(this.name);
	}
}

export class FBBundle {
	public name: string;
	public partitionCount: number;
	public size: number;

	constructor(bundleData: any) {
		this.name = bundleData.name;
		this.partitionCount = bundleData.partitionCount;
		this.size = bundleData.size;
	}

	get partitions() {
		return editor.fbdMan.getPartitions(this.name);
	}

	get paths() {
		return getPaths(this.name);
	}

	get fileName() {
		return getFilename(this.name);
	}
}

export class FBPartition {
	public name: string;
	public guid: Guid;
	public primaryInstance: Guid;
	public typeName: string;
	public instanceCount: number;

	constructor(partitionData: any) {
		this.name = partitionData.name;
		this.guid = partitionData.guid;
		this.primaryInstance = partitionData.primaryInstance;
		this.typeName = partitionData.typeName;
		this.instanceCount = partitionData.instanceCount;
	}

	get bundlesReferencedIn() {
		return editor.fbdMan.getBundlesReferencedIn(this.name);
	}

	get paths() {
		return getPaths(this.name);
	}

	get fileName() {
		return getFilename(this.name);
	}
}
