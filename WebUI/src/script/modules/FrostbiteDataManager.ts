import { signals } from '@/script/modules/Signals';
import JSZip from 'jszip';
import { JSZipUtils } from '@/script/libs/jszip-utils';
import { FBBundle } from '@/script/types/gameData/FBBundle';
import { FBSuperBundle } from '@/script/types/gameData/FBSuperBundle';
import { Dictionary } from 'typescript-collections';
import { FBPartition } from '@/script/types/gameData/FBPartition';
import { Guid } from '@/script/types/Guid';
import Instance from '@/script/types/ebx/Instance';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
import { CommandActionResult } from '@/script/types/CommandActionResult';

export class FrostbiteDataManager {
	public superBundles = new Dictionary<string, FBSuperBundle>();
	public bundles = new Dictionary<string, FBBundle>();
	public partitions = new Dictionary<string, FBPartition>();

	public assetHashes = new Dictionary<string, string>();
	public eventHashes = new Dictionary<string, string>();
	public InterfaceIDs = new Dictionary<string, string>();
	public partitionGuids = new Dictionary<string, FBPartition>();

	private files = new Dictionary<string, any>();
	private data: JSZip;

	constructor() {
		this.superBundles.setValue('all', new FBSuperBundle({
			name: 'all',
			chunkCount: 0,
			bundleCount: 0
		}));
		this.bundles.setValue('all', new FBBundle({
			name: 'all',
			partitionCount: 0,
			size: 0
		}));

		this.data = new JSZip();

		signals.editor.Initializing.connect(this._onEditorInitializing.bind(this));
		signals.editor.Ready.connect(this._onEditorReady.bind(this));
		signals.setEBXField.connect(this.onSetEBXField.bind(this));

		this._Init();
	}

	public _Init() {
		const scope = this;
		const jszu = new JSZipUtils();
		jszu.getBinaryContent('/data.zip', (err: any, data: any) => {
			if (err) {
				throw err; // or handle err
			}
			JSZip.loadAsync(data).then((zip) => {
				scope.data = zip;
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
		if (this.data === null) {
			return false;
		}
		Object.keys(this.data.files).forEach((fileNameJson) => {
			// Add filetype check here maybe?
			const fileName = fileNameJson.replace('.json', '');
			// @ts-ignore
			this.data.file(fileNameJson).async('string').then((text) => {
				this.files.setValue(fileName.toLowerCase(), JSON.parse(text));
				console.log('Loading ' + fileName);
				this._HandleFile(fileName.toLowerCase());
			});
		});
	}

	public async _HandleFile(fileName: string) {
		fileName = fileName.toLowerCase();
		const scope = this;
		const file = this.files.getValue(fileName);
		Object.keys(file).forEach(function(entryName) {
			const entry = file[entryName];
			switch (fileName) {
			case 'superbundles':
				scope.superBundles.setValue(entryName, new FBSuperBundle(entry));
				break;
			case 'bundles':
				scope.bundles.setValue(entryName, new FBBundle(entry));
				break;
			case 'partitions':
				// eslint-disable-next-line no-case-declarations
				const partition = new FBPartition(entry.name, entry.guid, entry.primaryInstance, entry.instances);
				scope.partitionGuids.setValue(partition.guid.toString().toLowerCase(), partition);
				scope.partitions.setValue(entryName, partition);
				break;
			default:
				// code block
			}
		});
		console.log('Loaded ' + fileName);
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

	public getPartitionByName(partitionName: string = ''): FBPartition | null {
		const partition = this.partitions.getValue(partitionName.toString().toLowerCase());
		return partition || null;
	}

	public getSuperBundle(superBundleName: string) {
		// return this.superBundles[superBundleName.toLowerCase()];
	}

	public getPartitions(bundleName?: string) {
		/*
		const scope = this;
		const partitions = {};

		if (p_BundleName === undefined || p_BundleName.toLowerCase() === 'all') {
			Object.keys(scope.files.bundles).forEach(function(bundleName) {
				const bundle = scope.files.bundles[bundleName.toLowerCase()];
				Object.values(bundle.partitions).forEach(function(partitionName) {
					const partition = scope.getPartitionByName(partitionName);
					if (partition !== undefined) {
						partitions[partitionName] = scope.partitions[partitionName];
					}
				});
			});
		} else if (scope.files.bundles[p_BundleName.toLowerCase()] !== undefined) {
			const bundle = scope.files.bundles[p_BundleName.toLowerCase()];
			Object.values(bundle.partitions).forEach(function(partitionName) {
				const partition = scope.getPartitionByName(partitionName);
				if (partition !== undefined) {
					partitions[partitionName] = scope.partitions[partitionName];
				}
			});
		} else {
			for (const key of Object.keys(scope.files.bundles)) {
				if (key.startsWith(p_BundleName)) {
					const bundle = scope.files.bundles[key];
					Object.values(bundle.partitions).forEach( (partitionName) => {
						const partition = scope.getPartitionByName(partitionName);
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
		const superBundle = this.files.partitions[p_PartitionName.toLowerCase()];
		return superBundle.bundlesReferencedIn;

		 */
	}

	public getInstance(partitionGuid: Guid, instanceGuid: Guid): Instance | null {
		const partition = this.partitionGuids.getValue(partitionGuid.toString().toLowerCase());
		if (partition) {
			return partition.getInstance(instanceGuid);
		}
		return null;
	}

	public getPartition(partitionGuid: Guid): FBPartition | null {
		const partition = this.partitionGuids.getValue(partitionGuid.toString().toLowerCase());
		if (partition) {
			return partition;
		}
		return null;
	}

	public getPartitionName(partitionGuid: Guid): string {
		const partition = this.partitionGuids.getValue(partitionGuid.toString().toLowerCase());
		return partition ? partition.name : '';
	}

	private onSetEBXField(commandActionResult: CommandActionResult) {
		// IEBXFieldData
		for (const override of commandActionResult.gameObjectTransferData.overrides) {
			const partition = this.getPartition(override.reference.partitionGuid);
			if (partition && partition.isLoaded) {
				const reference = override.reference.Resolve();
				if (reference) {
					reference.fields[override.field].value = override.value;
				}
			}
		}
	}
}
