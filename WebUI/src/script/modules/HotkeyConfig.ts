import CameraControls from 'camera-controls';
import { GIZMO_MODE, KEYCODE } from '../types/Enums';
import { Hotkey, HOTKEY_TYPE } from './Hotkey';
import { signals } from './Signals';

export const HOTKEYS: Hotkey[] = [
	// KeyDown
	new Hotkey(
		KEYCODE.F1,
		false,
		false,
		() => {
			window.vext.SendEvent('DisableEditorMode');
		},
		HOTKEY_TYPE.Down,
		'Disable free camera and take control of your character again.'
	),
	new Hotkey(KEYCODE.F2, false, false, () => {}, HOTKEY_TYPE.Lua, 'Teleport the player to the camera position.'),
	new Hotkey(
		KEYCODE.KEY_X,
		false,
		false,
		() => {
			editor.threeManager.toggleWorldSpace();
		},
		HOTKEY_TYPE.Down,
		'Switch between world or local space.'
	),
	new Hotkey(
		KEYCODE.KEY_F,
		false,
		false,
		() => {
			editor.threeManager.focus();
		},
		HOTKEY_TYPE.Down,
		'Focus the camera on the selected object.'
	),
	new Hotkey(
		KEYCODE.KEY_P,
		false,
		false,
		() => {
			editor.selectionGroup.selectParent();
		},
		HOTKEY_TYPE.Down,
		'Select objects parent.'
	),
	new Hotkey(
		KEYCODE.ALT,
		false,
		false,
		() => {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.ROTATE;
		},
		HOTKEY_TYPE.Down,
		'Enable camera rotation.'
	),
	new Hotkey(
		KEYCODE.KEY_D,
		true,
		false,
		() => {
			editor.Duplicate();
		},
		HOTKEY_TYPE.Down,
		'Clone selected entity.'
	),
	new Hotkey(
		KEYCODE.KEY_C,
		true,
		false,
		() => {
			editor.Copy();
		},
		HOTKEY_TYPE.Down,
		'Copy selected entity.'
	),
	new Hotkey(
		KEYCODE.KEY_V,
		true,
		false,
		() => {
			editor.Paste();
		},
		HOTKEY_TYPE.Down,
		'Paste saved entity to the selected group.'
	),
	new Hotkey(
		KEYCODE.KEY_X,
		true,
		false,
		() => {
			editor.Cut();
		},
		HOTKEY_TYPE.Down,
		'Cut selected entity.'
	),
	new Hotkey(
		KEYCODE.KEY_S,
		true,
		false,
		() => {
			signals.saveRequested.emit();
		},
		HOTKEY_TYPE.Down,
		'Open up the save window.'
	),
	new Hotkey(
		KEYCODE.DELETE,
		false,
		false,
		() => {
			editor.DeleteSelected();
		},
		HOTKEY_TYPE.Down,
		'Delete selected entity.'
	),
	new Hotkey(
		KEYCODE.F5,
		true,
		false,
		() => {
			window.location = (window as any).location;
		},
		HOTKEY_TYPE.Down,
		'Reload the whole map editor interface.'
	),
	new Hotkey(
		KEYCODE.ESCAPE,
		false,
		false,
		() => {
			editor.DeselectAll();
		},
		HOTKEY_TYPE.Down,
		'Clear selection.'
	),
	new Hotkey(
		KEYCODE.KEY_M,
		true,
		false,
		() => {
			if (editor.threeManager.miniBrushEnabled) {
				editor.threeManager.DisableMiniBrushMode();
			} else {
				editor.threeManager.EnableMiniBrushMode();
			}
		},
		HOTKEY_TYPE.Down,
		'Enable / disable mini brush mode.'
	),
	new Hotkey(
		KEYCODE.KEY_Z,
		true,
		true,
		() => {
			editor.redo();
		},
		HOTKEY_TYPE.Down,
		'Redo.'
	),
	new Hotkey(
		KEYCODE.KEY_Z,
		true,
		false,
		() => {
			editor.undo();
		},
		HOTKEY_TYPE.Down,
		'Undo.'
	),
	// KeyUp
	new Hotkey(
		KEYCODE.ALT,
		false,
		false,
		() => {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
		},
		HOTKEY_TYPE.Up,
		''
	),
	new Hotkey(
		KEYCODE.CTRL,
		false,
		false,
		() => {
			editor.threeManager.disableGridSnap();
		},
		HOTKEY_TYPE.Up,
		''
	),
	// CanvasKeyDown
	new Hotkey(
		KEYCODE.KEY_Q,
		false,
		false,
		() => {
			editor.threeManager.setGizmoMode(GIZMO_MODE.select);
		},
		HOTKEY_TYPE.CanvasOnlyDown,
		'Hide gizmos.'
	),
	new Hotkey(
		KEYCODE.KEY_W,
		false,
		false,
		() => {
			editor.threeManager.setGizmoMode(GIZMO_MODE.translate);
		},
		HOTKEY_TYPE.CanvasOnlyDown,
		'Change gizmo mode to translate.'
	),
	new Hotkey(
		KEYCODE.KEY_E,
		false,
		false,
		() => {
			editor.threeManager.setGizmoMode(GIZMO_MODE.rotate);
		},
		HOTKEY_TYPE.CanvasOnlyDown,
		'Change gizmo mode to rotate.'
	),
	new Hotkey(
		KEYCODE.KEY_R,
		false,
		false,
		() => {
			editor.threeManager.setGizmoMode(GIZMO_MODE.scale);
		},
		HOTKEY_TYPE.CanvasOnlyDown,
		'Change gizmo mode to scale.'
	),
	new Hotkey(
		KEYCODE.CTRL,
		false,
		false,
		() => {
			editor.threeManager.enableGridSnap();
		},
		HOTKEY_TYPE.CanvasOnlyDown,
		'While moving gizmo to snap to grid.'
	),
	// Freecam
	new Hotkey(KEYCODE.KEY_W, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Move forward.'),
	new Hotkey(KEYCODE.KEY_A, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Move left.'),
	new Hotkey(KEYCODE.KEY_S, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Move backward.'),
	new Hotkey(KEYCODE.KEY_D, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Move right.'),
	new Hotkey(KEYCODE.KEY_Q, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Move down.'),
	new Hotkey(KEYCODE.KEY_E, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Move up.'),
	new Hotkey(KEYCODE.SHIFT, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Makes the camera move faster.'),
	new Hotkey(KEYCODE.PAGE_DOWN, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Change the camera rotation speed.'),
	new Hotkey(KEYCODE.PAGE_UP, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Change the camera rotation speed.'),
	new Hotkey(KEYCODE.UP_ARROW, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Change the camera FOV.'),
	new Hotkey(KEYCODE.DOWN_ARROW, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Change the camera FOV.'),
	new Hotkey(KEYCODE.SCROLL_WHEEL, false, false, () => {}, HOTKEY_TYPE.Freecam, 'Change the camera speed.')
];
