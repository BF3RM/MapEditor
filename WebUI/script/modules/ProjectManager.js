/*



 */

class ProjectManager {
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

    }

    SaveProject() {
        let dialogElement = $("#save-project-dialog");
        let closeButton = {
            text: "Close", click: function () { dialogElement.dialog("close")}
        };

        editor.ui.CreateDialog(dialogElement, [closeButton], null)
                .dialog("open");

        $("#saveProjectTextArea").text("Loading...");
        editor.vext.SendEvent('RequestSave');
    }

    SetSave(json){

        $("#saveProjectTextArea").text(json);
        // editor.ui.dialogs["saveProject"].dialog("open");
    }

    LoadProject(blueprintsRaw) {
    }

    ListProjects(instanceGuid) {

    }
}

