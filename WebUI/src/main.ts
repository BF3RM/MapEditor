import Editor from "./script/Editor";

import './style/style.css';

let debugMode:boolean = false;
// var vext = new VEXTInterface();
if(window.location.href.indexOf("webui") === -1) {
    debugMode = true;
}

(window as any).editor = new Editor(debugMode);

