import Editor from "./script/Editor";

let debugMode:boolean = false;
var vext = new VEXTInterface();
if(window.location.href.indexOf("webui") === -1) {
    debugMode = true;
}
var editor = new Editor(debugMode);
