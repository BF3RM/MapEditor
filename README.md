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
- Open the command line
- Type `vumm install mapeditor@preview`

This will install the mod in the `Mods` folder and update your `modllist.txt` to include MapEditor. The VUMM command is also used to update the mod.

Alternatively, the mod can be installed manually by downloading the zip file attached in each [release version](https://github.com/BF3RM/MapEditor/releases).

## Developer set-up
- Install [nodejs](https://nodejs.org/en/).
- Install [yarn](https://yarnpkg.com/).
- Download MapEditor files and place them in  ``.../Server/Admin/Mods``. Path should look like ``.../Server/Admin/Mods/MapEditor``.
- Add ``mapeditor`` to your ``modlist.txt`` file.
- Open cmd, cd to ``.../Server/Admin/Mods/MapEditor/WebUI`` and run yarn.
- After all the dependencies are installed run ``yarn build``.

## Controls:

A list of controls can be found in-game. To reveal it, navigate in the toolbar to File->Hotkeys

## Mod Dependencies
MapEditor requires other mods to work fully:
- [NoHavok](https://github.com/BF3RM/NoHavok/issues). This mod converts Havok objects into Frostbite objects, allowing their manipulation. MapEditor works without this mod, but not all vanilla objects will be available for editing. NoHavok is still not completed and might lead to unexpected crashes and not work on some maps. To use it, simply download the mod in the `/Admin/Mods` folder and add `nohavok` to `modlist.txt`.

## Running saves for playing
If your project is ready to be used for playing, export your project's save from MapEditor and load it with
 [CustomLevelLoader](https://github.com/BF3RM/CustomLevelLoader). You can find an example in the [RealityMod branch](https://github.com/BF3RM/CustomLevelLoader/tree/realitymod-dev). For more information on how to similarly set up a project, check CustomLevelLoader's README file.

## Used libraries and tools
This project is using:
- [Three.js](https://threejs.org/) as the rendering foundation.
- [Vue.js](https://vuejs.org/)
- [Vue GoldenLayout](https://github.com/emedware/vue-golden-layout)
