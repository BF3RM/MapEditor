# Vext-MapEditor
A realtime map editor for Venice Unleashed

### IMPORTANT NOTE:
This is currently a WIP, it's not intended to be used yet. 
If you want to mess around go ahead, but expect crashes and bugs. 
It's not recommended to start any project yet, but if you still want to set up a server and try it out you need to follow the steps in the next section.
Public releases will have the compiled UI available for download. 

## Developer set-up
- Install [nodejs](https://nodejs.org/en/).
- Install [yarn](https://yarnpkg.com/).
- Place the UI compiler (``vuicc.exe``) in ``.../Server/Admin/`` folder.
- Download MapEditor files and place them in  ``.../Server/Admin/Mods``. Path should look like ``.../Server/Admin/Mods/MapEditor``.
- Add ``mapeditor`` to your ``modlist.txt`` file.
- Open cmd, cd to ``.../Server/Admin/Mods/MapEditor/WebUI`` and run yarn.
- After all the dependencies are installed run ``yarn build``.

## Controls:

F1 to enable freecam.

Once in freecam, hold right click and:

- F1 to disable freecam and take control of your character again
- WASD to move camera
- Mouse to rotate camera
- Q to move down
- E to move up
- Shift to move camera faster
- Scrollwheel to change camera speed
- Page up/down to change rotation speed

In freecam, without holding right click:

- ALT+Right click to orbit-rotate camera
- Middle mouse click to truck
- CTRL while moving gizmo to snap to grid
- F to focus the camera on the selected object
- Q to hide gizmo
- W to change gizmo mode to translate
- E to change gizmo mode to rotate 
- R to change gizmo mode to scale 
- X to toggle world/local coordinates
- F3 to reset the camera
- P to select parent
- CTRL+D to clone selected entity to the same directory
- CTRL+SHIFT+D to clone selected entity to the root directory
- CTRL+C to copy selected entity
- CTRL+V to paste saved entity to the selected group 
- CTRL+Z to undo 
- CTRL+SHIFT+Z to redo
- DEL to delete selected object
- F5 to reload UI
- ESC to clear selection

## Mod Dependencies
MapEditor requires other mods to work fully:
- [MapLoader](https://github.com/BF3RM/MapLoader). This mod is required to load saves.
- NoHavok. (Not publicly available yet). This mod transforms Havok objects into Frosbite objects, allowing their manipulation. MapEditor works without this mod, but not all vanilla objects will be available for editing.

## Running saves for playing
If your project is ready to be used for playing, you only need to run [MapLoader](https://github.com/BF3RM/MapLoader) and load the project save from another mod.

## Used libraries and tools
This project is using:
- [Three.js](https://threejs.org/) as the rendering foundation.
- [Vue.js](https://vuejs.org/)
- [Vue GoldenLayout](https://github.com/emedware/vue-golden-layout)
