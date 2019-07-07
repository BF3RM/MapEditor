/*



 */

class ProjectManager {
    constructor() {
        this.window = new ProjectWindow();
        signals.editorReady.add(this.onEditorReady.bind(this));
    }

    onEditorReady() {
        editor.ui.RegisterWindow("projectManager", "Project Manager", this.window, false);
        editor.ui.RegisterMenubarEntry("File", "New Project", this.NewProject)
    }

    NewProject(key, blueprint) {
    }

    LoadProject(blueprintsRaw) {
    }

    ListProjects(instanceGuid) {

    }
}

