
let FakeLevel = `
{
  "name": "XP3_Shield",
  "partitionGuid": "69AFE35D-259F-11E1-98E7-C42BEF8FFB67",
  "instanceGuid": "57425C7A-7D66-7067-1E26-0F83995C69ED"
}`;

editor.blueprintManager.RegisterBlueprints(xp3shieldBlueprints);
editor.threeManager.ShowGizmo();
editor.gameContext.LoadLevel(FakeLevel);
editor.vext.HandleResponse(xp3shield);
/*
vext.SpawnedEntity(1, "F17C9834-6CE0-D963-6911-926921A3FF24", "1,0,0,0,1,0,0,0,1,0, 10, 0");
vext.SpawnedEntity(2, "F7518E81-80E7-36F5-44C5-110C4F3ABE94", "1,0,0,0,1,0,0,0,1,0, 0, 10");
vext.SpawnedEntity(3, "31185055-81DD-A2F8-03FF-E0A6AAF960EC", "1,0,0,0,1,0,0,0,1,10, 0, 0");
editor.SelectEntityById(1);
*/