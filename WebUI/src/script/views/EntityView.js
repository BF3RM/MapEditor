export class EntityView {
    constructor() {
        this.dom = null;
        this.directory = null;
        this.content = [];

        signals.selectedGameObject.add(this.onGameObjectSelected.bind(this));
        this.header = this.Header();

        this.Initialize();
    }

    Header() {
        let row = new UI.TableRow();
        row.add(new UI.TableHeader(""));
        row.add(new UI.TableHeader("Name"));
        row.add(new UI.TableHeader("Type"));
        return row;
    }


    Initialize() {
        this.dom = new UI.Panel();

        this.directory = new UI.Table();
        this.dom.add(this.Header());
        this.dom.add(this.directory);
    }


    onGameObjectSelected(guid, isMultipleSelection) {
        let scope = this;
        this.content = [];
        this.directory.clear();
        let go = editor.getGameObjectByGuid(guid);
        go.gameEntities.forEach(function (child) {
            let entry = scope.entityRenderer(child);
            scope.content.push(entry);
            scope.directory.add(entry);
        })

    }


    matches(name, searchString) {
        name = name.toLowerCase();
        searchString = searchString.toLowerCase();
        return (searchString === "" || searchString === undefined || name.includes(searchString));
    }

    entityRenderer(entity) {
        let entry = new UI.TableRow();
        let icon = new UI.Icon(entity.typeName);


        let name = new UI.TableData(entity.typeName);

        entry.add(icon,name,new UI.TableData(entity.typeName));

        entry.setAttribute('draggable', true);
        entry.addClass("draggable");

        return entry;
    }

}
var EntityViewComponent = function( container, state ) {
    this._container = container;
    this._state = state;
    this.element = new EntityView();

    this._container.getElement().html(this.element.dom.dom);
};