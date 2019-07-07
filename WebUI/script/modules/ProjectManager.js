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
        editor.ui.RegisterMenubarEntry(["File", "New Project", "From template", "Other map"], this.NewProject);
    }

    NewProject() {

    }

    LoadProject(blueprintsRaw) {
    }

    ListProjects(instanceGuid) {

    }
}

