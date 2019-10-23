/*



 */

export class ProjectManager {
    constructor() {
        this.window = new ProjectWindow();
        signals.editorInitializing.add(this.onEditorInitializing.bind(this));
        signals.editorReady.add(this.onEditorReady.bind(this));
    }

    onEditorInitializing() {
        editor.ui.RegisterWindow("projectManager", "Project Manager", this.window, false);

        editor.ui.RegisterMenubarEntry(["File", "New Project", "From scratch"], this.NewProject);
        editor.ui.RegisterMenubarEntry(["File", "New Project", "From template", "This map"], this.NewProject);
        editor.ui.RegisterMenubarEntry(["File", "New Project", "From template", "Other map"], this.NewProject);
    }

    onEditorReady() {
        editor.ui.RegisterMenubarEntry(["Edit", "Project Settings"], this.NewProject);
        editor.ui.RegisterMenubarEntry(["File", "Preferences"], this.NewProject);
        editor.ui.RegisterMenubarEntry(["File", "Save Project"], this.SaveProject);
        editor.ui.RegisterMenubarEntry(["File", "New Project", "From template", "Other map"], this.NewProject);
    }

    NewProject() {
        editor.ui.OpenWindow("projectManager");
    }

    SaveProject() {
        let dialogElement = $("#save-project-dialog");
        let closeButton = {
            text: "Close", click: function () { dialogElement.dialog("close")}
        };

        editor.ui.CreateDialog(dialogElement, [closeButton], null)
                .dialog("open");

        // TODO: Replace with proper View-Data

        let projectSaveData = {
            projectName: "DebugProject",
            mapName: "XP1_001",
            gameModeName: "ConquestAssaultLarge0",
            requiredBundles: "{ 'levels/sp_sniper/malldefence_animation5', 'levels/sp_sniper/background_persistant', 'levels/sp_sniper/mall_behindstreet' }", // replace with the paths of the bundles
        };

        $("#saveProjectTextArea").text("Saving...");
        editor.vext.SendEvent('RequestProjectSave', projectSaveData);
    }

    SetSave(json){

        $("#saveProjectTextArea").text(json);
        // editor.ui.dialogs["saveProject"].dialog("open");
    }

    LoadProject() {
        // TODO: Replace with proper View-Data
        let projectName = "DebugProject";

        $("#saveProjectTextArea").text("Loading...");
        editor.vext.SendEvent('RequestProjectLoad', projectName);
    }

    DeleteProject() {
        // TODO: Replace with proper View-Data
        let projectName = "DebugProject";

        $("#saveProjectTextArea").text("Deleting...");
        editor.vext.SendEvent('RequestProjectDelete', projectName);
    }

    RequestProjectData() {
        // TODO: Replace with proper View-Data
        let projectName = "DebugProject";

        $("#saveProjectTextArea").text("Loading...");
        editor.vext.SendEvent('RequestProjectData', projectName);
    }

    ListProjects(instanceGuid) {

    }
}

