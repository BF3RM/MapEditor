class FrostbiteDataManager {
    constructor() {
        this.window = new ImportWindow();

        this.superBundles = {
        	all: new FBSuperBundle({
		        name: "all",
		        chunkCount: 0,
		        bundleCount: 0,
	        })
        };
        this.bundles = {
	        all: new FBBundle({
		        name: "all",
		        partitionCount: 0,
		        size: 0,
	        })
        };
        this.partitions = {};

        this._files = {};
        this._data = null;

        signals.editorInitializing.add(this._onEditorInitializing.bind(this));
        signals.editorReady.add(this._onEditorReady.bind(this));

        this._Init();

    }

    _Init() {
        let scope = this;
        JSZipUtils.getBinaryContent('data/data.zip', function(err, data) {
            if(err) {
                throw err; // or handle err
            }
            JSZip.loadAsync(data).then(function (zip) {
                scope._data = zip;
                scope._ExtractFiles();
            });
        });
    }

    _onEditorInitializing() {
        editor.ui.RegisterWindow("ImportWindow", "Import bundle", this.window, true);
    }

    _onEditorReady() {
        let scope = this;
        editor.ui.RegisterMenubarEntry(["Edit", "Import"], function () {
            this.window.Update();
            editor.ui.OpenWindow("importwindow");
        } );
    }

    _ExtractFiles() {
        let scope = this;
        if(scope._data === null) {
            return false;
        }
        Object.keys(scope._data.files).forEach(function (fileNameJson) {
            // Add filetype check here maybe?
            let fileName = fileNameJson.replace(".json","");
            scope._data.file(fileNameJson).async("string").then(function (text) {
                scope._files[fileName.toLowerCase()] = JSON.parse(text);
                console.log("Loading " + fileName);
                scope._HandleFile(fileName.toLowerCase());
            });
        });
    }

    async _HandleFile(p_FileName) {
        p_FileName = p_FileName.toLowerCase();
        let scope = this;
        let file = scope._files[p_FileName];
        Object.keys(file).forEach(function(entryName) {
            let entry = file[entryName];
            switch(p_FileName) {
                case "superbundles":
                    scope.superBundles[entryName] = new FBSuperBundle(entry);
                    break;
                case "bundles":
                    scope.bundles[entryName] = new FBBundle(entry);
                    break;
                case "partitions":
                    scope.partitions[entryName] = new FBPartition(entry);
                    break;
                default:
                // code block
            }
        });
        console.log("Loaded " + p_FileName);
    }
    getBundle(path) {
        return this.bundles[path];
    }
    getSuperBundles() {
        let scope = this;
        let superBundles = {};
        Object.keys(scope._files["superbundles"]).forEach(function (superBundleName) {
            superBundles[superBundleName] = scope.superBundles[superBundleName];
        });
        return superBundles;
    }

    getBundles(p_SuperBundleName) {
        let scope = this;
        let bundles = [];


        if(p_SuperBundleName === undefined || p_SuperBundleName.toLowerCase() === "all") {
	        return scope.bundles
        }else if(scope.superBundles[p_SuperBundleName.toLowerCase()] !== undefined) {
            let bundlesRaw = scope.getBundlesRaw(p_SuperBundleName);
            Object.values(bundlesRaw).forEach((bundle) => {
            	bundles.push(scope.getBundle(bundle))
            });
        }
        return bundles;
    };

    getBundlesRaw(p_SuperBundleName) {
    	let scope = this;
    	return scope._files["superbundles"][p_SuperBundleName.toLowerCase()].bundles;
    }

    getPartition(p_PartitionName) {
        return this.partitions[p_PartitionName.toLowerCase()];
    }
    getSuperBundle(p_SuperBundleName) {
        return this.superBundles[p_SuperBundleName.toLowerCase()];
    }
    getPartitions(p_BundleName) {
        let scope = this;
        let partitions = {};

        if(p_BundleName === undefined || p_BundleName.toLowerCase() === "all") {
            Object.keys(scope._files["bundles"]).forEach(function (bundleName) {
                let bundle = scope._files["bundles"][bundleName.toLowerCase()];
                Object.values(bundle.partitions).forEach(function (partitionName) {
                    let partition = scope.getPartition(partitionName);
                    if(partition !== undefined) {
                        partitions[partitionName] = scope.partitions[partitionName];
                    }
                });
            });
        } else if(scope._files["bundles"][p_BundleName.toLowerCase()] !== undefined) {
            let bundle = scope._files["bundles"][p_BundleName.toLowerCase()];
            Object.values(bundle.partitions).forEach(function (partitionName) {
                let partition = scope.getPartition(partitionName);
                if(partition !== undefined) {
                    partitions[partitionName] = scope.partitions[partitionName];
                }
            });
        } else {
            for (let key of Object.keys(scope._files["bundles"])) {
                if (key.startsWith(p_BundleName)) {
                    let bundle = scope._files["bundles"][key];
                    Object.values(bundle.partitions).forEach( (partitionName)=> {
                        let partition = scope.getPartition(partitionName);
                        if(partition !== undefined) {
                            partitions[partition.name] = partition;
                        }
                    });
                }
            }
        }
        return partitions;
    };

    getBundlesReferencedIn(p_PartitionName) {
        let superBundle = this._files["partitions"][p_PartitionName.toLowerCase()];
        return superBundle.bundlesReferencedIn;
    }


}

class FBSuperBundle {
    constructor(p_SuperBundleData) {
        this.name = p_SuperBundleData.name;
        this.chunkCount = p_SuperBundleData.chunkCount;
        this.bundleCount = p_SuperBundleData.bundleCount;
    }

    get bundles() {
    	let scope = this;
    	if(this.name == "All") {
		    return editor.fbdMan.getBundles();
	    }
        return editor.fbdMan.getBundles(this.name);
    }
    get paths() {
        return getPaths(this.name)
    }
    get fileName() {
        return getFilename(this.name)
    }
}

class FBBundle {
    constructor(p_BundleData) {
        this.name = p_BundleData.name;
        this.partitionCount = p_BundleData.partitionCount;
        this.size = p_BundleData.size;
    }

    get partitions() {
        return editor.fbdMan.getPartitions(this.name);
    }
    get paths() {
        return getPaths(this.name)
    }
    get fileName() {
        return getFilename(this.name)
    }
}

class FBPartition {
    constructor(p_PartitionData) {
        this.name = p_PartitionData.name;
        this.guid = p_PartitionData.guid;
        this.primaryInstance = p_PartitionData.primaryInstance;
        this.typeName = p_PartitionData.typeName;
        this.instanceCount = p_PartitionData.instanceCount;
    }

    get bundlesReferencedIn() {
        return editor.fbdMan.getBundlesReferencedIn(this.name);
    }
    get paths() {
        return getPaths(this.name)
    }
    get fileName() {
        return getFilename(this.name)
    }
}