# Vext-MapEditor
A real-time, multiplayer in-game level for Battlefield 3/[Venice Unleashed](https://veniceunleashed.net/)

### IMPORTANT NOTE:
This mod is still under development, some features are missing and there can be bugs and crashes. That said, it's already possible to develop projects with it. Preview versions are currently being published and come with a compiled UI.

## Prerequisites:
- Install Venice Unleashed and [set it up](https://docs.veniceunleashed.net/hosting/prereq/)
- Set up a [dedicated server environment](https://docs.veniceunleashed.net/hosting/setup-win/)

## Set-up
The recommended way of installing and keeping the mod up-to-date is to use [VUMM](https://github.com/BF3RM/vumm-cli), short for Venice Unleashed Mod Manager. 

The installation steps are:
- Install VUMM and register an account (check VUMM repository for more info)
- Open the command line in ``..\<user>\Documents\Battlefield 3\Server\Admin`` folder
- Type `vumm install mapeditor@preview`

This will install the mod in the `Mods` folder and update your `modllist.txt` to include MapEditor. The VUMM command is also used to update the mod.

Alternatively, the mod can be installed manually by downloading the zip file attached in each [release version](https://github.com/BF3RM/MapEditor/releases).

## Developer set-up
- Install [pnpm](https://pnpm.io/installation/).
- Download MapEditor files and place them in  ``.../Server/Admin/Mods``. Path should look like ``.../Server/Admin/Mods/MapEditor``.
- Add ``mapeditor`` to your ``modlist.txt`` file.
- Open cmd, cd to ``.../Server/Admin/Mods/MapEditor/WebUI`` and run `pnpm i`.
- After all the dependencies are installed run ``pnpm build``.

## Controls:

A list of controls can be found in-game. To reveal it, navigate in the toolbar to File->Hotkeys

## Mod Dependencies
MapEditor requires other mods to work fully:
- [NoHavok](https://github.com/BF3RM/NoHavokGen). This mod converts Havok objects into Frostbite objects, allowing their manipulation. MapEditor works without this mod, but not all vanilla objects will be available for editing.

## Running saves for playing
If your project is ready to be used for playing, export your project's save from `MapEditor`, save it in a `.json` file and use [LevelLoaderGen](https://github.com/BF3RM/LevelLoaderGen) to generate the loader mod. Check out `LevelLoaderGen` repository for more information. If the level was generated with `NoHavok`, you will need to run it as well.

## Used libraries and tools
This project is using:
- [Three.js](https://threejs.org/) as the rendering foundation.
- [Vue.js](https://vuejs.org/)
- [Vue GoldenLayout](https://github.com/emedware/vue-golden-layout)
