var json = `
{
  "B9E3B4B8-062A-1DA8-E13D-8D7095F2A610": {
	"typeName": "ObjectBlueprint",
	"name": "test1/M16A4KitPickup",
	"partitionGuid": "625C2806-0CE7-11E0-915B-91EB202EAE87",
	"instanceGuid": "B9E3B4B8-062A-1DA8-E13D-8D7095F2A610",
	"variations": [
		{
			"hash": "3490128360", 
			"name": "SomeVariation: 3490128360"
		}, {
			"hash": "1446624100", 
			"name": "SomeVariation: 1446624100"
		}, {
			"hash": "219528900", 
			"name": "SomeVariation: 219528900"
		}, {
			"hash": "1215191320", 
			"name": "SomeVariation: 1215191320"
		}
	  ]
  },
  "29E3B4B8-062A-1DA8-E13D-8D7095F2A610": {
	"typeName": "SpatialPrefabBlueprint",
	"name": "test2/M16A4KitPickup_prefab",
	"partitionGuid": "225C2806-0CE7-11E0-915B-91EB202EAE87",
	"instanceGuid": "29E3B4B8-062A-1DA8-E13D-8D7095F2A610",
	"variations": [
		{
			"hash": "3490128360", 
			"name": "SomeVariation: 3490128360"
		}, {
			"hash": "1446624100", 
			"name": "SomeVariation: 1446624100"
		}, {
			"hash": "219528900", 
			"name": "SomeVariation: 219528900"
		}, {
			"hash": "1215191320", 
			"name": "SomeVariation: 1215191320"
		}
	]
  }
}`;
editor.blueprintManager.RegisterBlueprints(json);
editor.threeManager.ShowGizmo();
/*
vext.SpawnedEntity(1, "F17C9834-6CE0-D963-6911-926921A3FF24", "1,0,0,0,1,0,0,0,1,0, 10, 0");
vext.SpawnedEntity(2, "F7518E81-80E7-36F5-44C5-110C4F3ABE94", "1,0,0,0,1,0,0,0,1,0, 0, 10");
vext.SpawnedEntity(3, "31185055-81DD-A2F8-03FF-E0A6AAF960EC", "1,0,0,0,1,0,0,0,1,10, 0, 0");
editor.SelectEntityById(1);
*/