/**
 * Created by Powback on 30.04.2018.
 */


var blueprintArray, entityArray;
var blueprintTable, entityTable = null;
var debug = false;
var instances = null;
var selectedEntityID = -1;
var json = '[{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarWaterplane_01/SkybarWaterplane_01","partitionGuid":"6E082A36-41AD-11E1-9C16-911623F91D9D","instanceGuid":"A789BD70-2F4F-B974-7D80-8ECB5A29BE25"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/WallModulesSkybar/FireplaceSkybar512_03","partitionGuid":"2B3DB769-2592-11E1-BC0B-B18091F07300","instanceGuid":"627ED3E0-C04B-F5AE-A3F6-578465DBB787"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/BushFern_01/BushFern_M_01","partitionGuid":"0B5B6C97-6140-11E1-AC59-C1D4501A00AE","instanceGuid":"367865EC-5F98-7004-064A-EEC004CB3EB7"},{"typeName":"EffectBlueprint","name":"FX/DLC/XP2/Impact/Generic/FX_DLC_Plaster_MediumExplosion","partitionGuid":"FCB2690D-A1BC-435E-9F4B-B3310804CEB9","instanceGuid":"CC152690-300D-40F8-BCAC-439103006F39"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Trellis/Trellis_Cluster_02","partitionGuid":"006B2D35-4DA9-11E1-80BD-E6174BD5AB02","instanceGuid":"C13B5B36-8C86-A4A5-76C1-2420153EAA58"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Trellis/Trellis_Cluster_03","partitionGuid":"7F897E35-4DA9-11E1-80BD-E6174BD5AB02","instanceGuid":"A2A29C77-F624-C1C7-FDB4-24948B98A6EB"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Trellis/Trellis_02","partitionGuid":"A8E59154-4D78-11E1-B69D-FBDEC9155624","instanceGuid":"6AAC3DD4-19DC-03BF-3197-DC3EDFF037B9"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Office/Props/PaperPile_01_XP2","partitionGuid":"114B5DF4-4888-45D7-8782-AA15066E5312","instanceGuid":"E73C9128-D263-441F-9BA9-F7EFFF0CDB18"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Office/Props/PaperPile_02_XP2","partitionGuid":"CE6B1246-86F0-4E08-92C1-BD26148369E4","instanceGuid":"789EB4AD-C583-4556-A99F-0E0C53AB14E0"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Office/Props/PaperPile_05_XP2","partitionGuid":"2B4AF1D5-7B84-4320-8A47-0230EAFF1CC8","instanceGuid":"B0FDC5A4-ACB8-499D-B5BA-CF58BB4F53CA"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Plant_01/Plant_01_Banger_01","partitionGuid":"21704599-57E7-11E1-9C6F-FC0FDB8DF3DD","instanceGuid":"4B32D585-D703-6561-861A-7ABE0A01209F"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Plant_01/Plant_01","partitionGuid":"CA2672FB-561E-11E1-9E4B-FE757C1FE0EB","instanceGuid":"010C8D55-2E24-E039-2264-6F3E7D38233D"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/ElevatorShaft_01/ElevatorShaft_01","partitionGuid":"806E7D90-50E2-11E1-AF68-E0473B54C175","instanceGuid":"B5F86A08-33A3-2581-E2C4-E3A1B8DF679A"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarWallprops/LargeGrill","partitionGuid":"3F155887-64A9-11E1-85B6-A7E6189144DC","instanceGuid":"73E29528-A690-95E5-84E8-6BFF17D11D54"},{"typeName":"ObjectBlueprint","name":"Levels/XP2_Skybar/Objects/Roof_small_01","partitionGuid":"6EA16633-4846-11E1-9F5E-D225759B6FFD","instanceGuid":"47EACCC1-4FDE-EE0F-5E79-4016D3A70ACF"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/InvisibleCollision_01_XP2/InvisibleCollision_CharAndVeh_01_Scalable_XP2","partitionGuid":"7455FBF9-8BEE-453B-B358-03088038BFFD","instanceGuid":"3F62C691-168F-408C-BDE8-F54020D780B8"},{"typeName":"EffectBlueprint","name":"FX/DLC/XP2/Destruction/Specific/Props/Papers/FX_Prop_Destruct_PaperPiles_01","partitionGuid":"093AD658-3A68-4DC1-94AA-9117C570A890","instanceGuid":"4D6F99D3-46B8-4D63-B11F-A5063C8B7FF5"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarWallprops/LongGrill","partitionGuid":"23E95257-64A9-11E1-85B6-A7E6189144DC","instanceGuid":"E5876866-F355-07FD-F194-413D211D0C50"},{"typeName":"EffectBlueprint","name":"FX/DLC/XP2/Ambient/LevelSpecific/MP_Skybar/FX_DLC_Amb_MPSkybar_Elevator_Smoke","partitionGuid":"3478B1BA-961C-440A-BC06-E84C73E43CD1","instanceGuid":"E463BA99-B2B0-4EB1-B443-0DA15EB1F287"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Trellis/Trellis_01","partitionGuid":"11DA3E98-4CD2-11E1-8FE2-F51FF3A2B824","instanceGuid":"B8DFA3D3-893D-89C9-2146-8D1F3121BAC5"},{"typeName":"PrefabBlueprint","name":"xp2/objects/spotlight_01/spotlight_01_lamp_01_nongroupable_autogen","partitionGuid":"3FF77DDF-B147-E0BB-BACC-DB2EB8A1589B","instanceGuid":"3FF77DDF-B147-E0BB-BACC-DB2EB8A1589B"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/_Clusters/Wood_01_Medium","partitionGuid":"A6DE0C38-436F-11E1-9459-A4827ABAFC6E","instanceGuid":"D8A56D53-33FF-9F14-445C-E9A304788ED5"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Flower_01/Flower_01_Cluster","partitionGuid":"EE9810D5-1530-46ED-AD6C-F8563986839F","instanceGuid":"DEEDA54A-E64B-40C3-81A7-A2EB3E665EB2"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/LuxuryBed_02/LuxuryBed_02_GavelCluster01","partitionGuid":"7234D374-5304-11E1-981D-89703B7D01B7","instanceGuid":"7318165F-F682-FD3F-E3E4-190C76E9FFA0"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/LuxuryBed_02/LuxuryBed_02_GavelCluster02","partitionGuid":"9D6BDF63-5304-11E1-981D-89703B7D01B7","instanceGuid":"1ACDB076-7808-62CA-E24A-4D78DA79AC49"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/ConferenceTable_01/ConferenceTable_01_cluster","partitionGuid":"E8E7D66B-53E6-11E1-B818-DDB90DAE3C15","instanceGuid":"F95EF999-7CF7-B103-BCC2-CB746A00342C"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarRooflights/SkybarRooflights_Cluster","partitionGuid":"5755FE3D-57BC-11E1-973A-94176F0B3122","instanceGuid":"4A94ACD5-733C-0171-1078-839698B98450"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/Pergola_01/Pergola_Cluster_01","partitionGuid":"B201D8CF-3C6D-11E1-8B40-F572690EEAE6","instanceGuid":"47D513C4-698E-8DF3-79DE-EBC63F60D4F5"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarDiner/SkybarDiner_Chair_Cluster","partitionGuid":"9E491A99-4CE5-11E1-BCCD-F4A6C910714D","instanceGuid":"1509CBF3-EFF1-6EA6-43FC-6043CF12570A"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarWindows_01/SkybarWindows_256_Cluster","partitionGuid":"B7F6200E-263C-11E1-BEBE-C82B4370E37A","instanceGuid":"38ABBE32-5C72-5332-004E-C1A3DA094D07"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarGlassWall_01/SkybarGlassWall_01_Cluster","partitionGuid":"B683F3A9-383F-4070-B450-E27B4F85B1EA","instanceGuid":"7B3F19F7-3DE6-4CE9-8C56-FF0FB4F28DD9"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/ModernRailing_01/ModernRailing_01_128_Cluster","partitionGuid":"27937CA4-11FD-48C7-A9BE-077C4C8508E6","instanceGuid":"2559816E-5BFF-4F32-8991-59A9801E1406"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarWindows_01/SkybarWindows_128_Cluster","partitionGuid":"8FCC55DE-263C-11E1-BEBE-C82B4370E37A","instanceGuid":"87D21517-D0C8-5650-128C-963FDF45526E"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarDiner/SkybarDiner_Table_Cluster","partitionGuid":"2224492C-4DC4-11E1-B395-98393026C508","instanceGuid":"540B2A5B-B9C1-5E88-8807-842587068B6E"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/_Clusters/Marble_01","partitionGuid":"6FAF43ED-4E6E-11E1-BC67-F177045B2F46","instanceGuid":"3D63FF8D-E058-025D-CAA1-506FB8A5399F"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SkybarDiner/SkybarDiner_Flowers","partitionGuid":"D04B60AF-4E6C-11E1-BC67-F177045B2F46","instanceGuid":"7BFB0E58-0CD3-8486-C920-A46B0994D0C4"},{"typeName":"ObjectBlueprint","name":"XP2/Objects/SunBed/SunBed","partitionGuid":"B5327047-484F-11E1-9F3A-AD0F9030CD75","instanceGuid":"A1D2B245-0DB9-8E11-AF15-6EA5071B5F03"}]';

if (debug) {
	RegisterInstances(json);
}

function Debug(){
	$('body').css("background", 'url(\"img/bf3bg.png\")');
	$('body').css("background-size", 'cover');
	RegisterInstances(json);

	// selectedEntityID = 1;
	SetGizmoAt(1,0,0,0,1,0,0,0,1, 550, 115, 261);
	ShowGizmo();
	OnSpawnedEntity(1, "A789BD70-2F4F-B974-7D80-8ECB5A29BE25", "1,0,0,0,0,1,0,0,0,0,1,0,549.7808420254872,115,261,1")
	OnSpawnedEntity(2, "627ED3E0-C04B-F5AE-A3F6-578465DBB787", "1,0,0,0,0,1,0,0,0,0,1,0,548.904210127436,115,261,1")
}

function RegisterInstances(p_Instances) {

	// console.log(p_Instances);
	instances = JSON.parse(p_Instances);

	blueprintArray = {};
	entityArray = {};

	for (var i = instances.length - 1; i >= 0; i--) {
		let id = instances[i].instanceGuid

		blueprintArray[id] = {
			typeName: instances[i].typeName,
			blueprintName: instances[i].name,
			partitionGuid: instances[i].partitionGuid,
			instanceGuid: instances[i].instanceGuid,
		}
	}

	drawTable(instances);
}

function drawTable(data) {
	console.log(data.length)
	DrawTable();
	for (var i = 0; i < data.length; i++) {

		drawRow(i, data[i]);
	}
}

function DrawTable() {
	blueprintTable = $('#blueprint_list').DataTable({
		select: true,
		"columnDefs": [{
			"targets": [0],
			"visible": false,
		}, {
			"targets": [1],
			"visible": false,
		}]
	});

	$('#blueprint_list tbody').on('click', 'tr', function() {
		let data = blueprintTable.row(this).data();

		SpawnInstance(data[1], data[0]);
	});

	entityTable = $('#entity_list').DataTable({
		select: true,
		// "columnDefs": [{
		// 	"targets": [0],
		// 	"visible": true,
		// }, {
		// 	"targets": [1],
		// 	"visible": true,
		// }]
	});

	$('#entity_list tbody').on('click', 'tr', function(){

		let data = entityTable.row(this).data();
		let id = data[0];
		console.log(id );

		if (selectedEntityID == id) {
			//unselect

			selectedEntityID = -1;

			$(this).removeClass("selectedItem");

			WebUI.Call('DispatchEventLocal', 'MapEditor:UnselectEntity', id)
		}
		else{
			//select
			selectedEntityID = id;
			
			$(".selectedItem").removeClass("selectedItem");

			$(this).addClass("selectedItem");

			WebUI.Call('DispatchEventLocal', 'MapEditor:SelectEntity', id)
		}
	});

	$("input").focus(function() {
		EnableKeyboard();
	});
	$("input").blur(function() {
		DisableKeyboard();
	});
}

function SpawnInstance( p_PartitionGuid, p_InstanceGuid) {
	console.log(p_PartitionGuid + " | " + p_InstanceGuid)
	WebUI.Call('DispatchEventLocal', 'MapEditor:SpawnInstance', p_PartitionGuid + ":" + p_InstanceGuid)
}

function EnableKeyboard() {
	WebUI.Call('DispatchEventLocal', 'MapEditor:EnableKeyboard')
}

function DisableKeyboard() {
	WebUI.Call('DispatchEventLocal', 'MapEditor:DisableKeyboard')
}

function drawRow(id, rowData) {
	blueprintTable.row.add( [  rowData.instanceGuid, rowData.partitionGuid, rowData.typeName, rowData.name] ).draw()

}

/*
	entities table
*/

function OnSpawnedEntity(p_ID, p_BlueprintID, p_MatrixString) {

	//Reset table if you reload the mod
	if (p_ID == 1) {
		ClearTable(entityTable)
	}

	let data = blueprintArray[p_BlueprintID];
	entityTable.row.add( [ p_ID, data.blueprintName ] ).draw();
	entityArray[p_ID] = {id: p_ID, blueprintID: p_BlueprintID, matrix: p_MatrixString};
}

function ClearTable(p_Table){
	p_Table.clear().draw();
}

function DeleteSelectedEntity(){
	if (selectedEntityID < 0 ) {
		return
	}
	WebUI.Call('DispatchEventLocal', 'MapEditor:DeleteEntity', selectedEntityID)
}

function RemoveEntityFromList(p_ID){
	let row = entityTable.row( p_ID - 1 );

	row.remove().draw();
	delete entityArray[p_ID];

	if (p_ID == selectedEntityID){
		selectedEntityID = -1;

		$(".selectedItem").removeClass("selectedItem");

		WebUI.Call('DispatchEventLocal', 'MapEditor:UnselectEntity', p_ID)
	}
}

function Serialize(){
	let array = [];

	Object.keys(entityArray).forEach(function(key,index) {
		let blueprintID = entityArray[key].blueprintID;
		let data = blueprintArray[blueprintID]

		array.push({
			partitionGuid: data.partitionGuid,
			instanceGuid: data.instanceGuid,
			matrix: entityArray[key].matrix,
		});
	});

	var prefix =
		'return [[\n';

	var suffix = '\n]]\n\n\n'

	var myJSON = JSON.stringify(array);
	// console.log(myJSON)
	$("#CurrentState").text(prefix + myJSON + suffix);
}

$(document).on('focus', 'textarea', function() {
	EnableKeyboard();
});
$(document).on('focusout', 'textarea', function() {
	DisableKeyboard();
});
