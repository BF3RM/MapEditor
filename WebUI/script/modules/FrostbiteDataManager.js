class FrostbiteDataManager {
    constructor() {
        this.superBundles = {};
        this.bundles = {};
        this.partitions = {};

        this._files = {};
        this._data = null;
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

    getBundles(p_SuperBundleName) {
        let scope = this;
        let superBundle = scope._files["superbundles"][p_SuperBundleName.toLowerCase()];
        let bundles = {};
        Object.values(superBundle.bundles).forEach(function (bundleName) {
            bundles[bundleName] = scope.bundles[bundleName];
        });
        return bundles;
    };

    getPartitions(p_BundleName) {
        let scope = this;
        let bundle = this._files["bundles"][p_BundleName.toLowerCase()];
        let partitions = {};
        Object.values(bundle.partitions).forEach(function (partitionName) {
            partitions[partitionName] = scope.partitions[partitionName];
        });
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
        return editor.fbdMan.getBundles(this.name);
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
}