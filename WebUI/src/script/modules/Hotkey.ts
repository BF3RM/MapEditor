import { KEYCODE } from '@/script/types/Enums';

export enum HOTKEY_TYPE {
	Down,
	Up,
	CanvasOnlyDown,
	Lua, // These keys have no functions on the UI side, only on the Lua side.
	Freecam, // These keys have no functions on the UI side, only on the Lua side.
}

export class Hotkey {
	public key: KEYCODE|string;
	public needsCtrl: boolean;
	public needsShift: boolean;
	public callback: () => void;
	public type: HOTKEY_TYPE = HOTKEY_TYPE.Down;
	public description: string = '';

	constructor(
		key: KEYCODE|string,
		needsCtrl: boolean,
		needsShift: boolean,
		callback: () => void,
		type: HOTKEY_TYPE = HOTKEY_TYPE.Down,
		description: string = ''
	) {
		this.key = key;
		this.needsCtrl = needsCtrl;
		this.needsShift = needsShift;
		this.callback = callback;
		this.description = description;
		this.type = type;
	}
}

export const keyCodeToChar = {
	8: 'Backspace',
	9: 'Tab',
	13: 'Enter',
	16: 'Shift',
	17: 'Ctrl',
	18: 'Alt',
	19: 'Pause/Break',
	20: 'Caps Lock',
	27: 'Esc',
	32: 'Space',
	33: 'PgUp',
	34: 'PgDn',
	35: 'End',
	36: 'Home',
	37: 'Left',
	38: 'Up',
	39: 'Right',
	40: 'Down',
	45: 'Insert',
	46: 'Delete',
	48: '0',
	49: '1',
	50: '2',
	51: '3',
	52: '4',
	53: '5',
	54: '6',
	55: '7',
	56: '8',
	57: '9',
	65: 'A',
	66: 'B',
	67: 'C',
	68: 'D',
	69: 'E',
	70: 'F',
	71: 'G',
	72: 'H',
	73: 'I',
	74: 'J',
	75: 'K',
	76: 'L',
	77: 'M',
	78: 'N',
	79: 'O',
	80: 'P',
	81: 'Q',
	82: 'R',
	83: 'S',
	84: 'T',
	85: 'U',
	86: 'V',
	87: 'W',
	88: 'X',
	89: 'Y',
	90: 'Z',
	91: 'Windows',
	93: 'Right Click',
	96: 'Numpad 0',
	97: 'Numpad 1',
	98: 'Numpad 2',
	99: 'Numpad 3',
	100: 'Numpad 4',
	101: 'Numpad 5',
	102: 'Numpad 6',
	103: 'Numpad 7',
	104: 'Numpad 8',
	105: 'Numpad 9',
	106: 'Numpad *',
	107: 'Numpad +',
	109: 'Numpad -',
	110: 'Numpad .',
	111: 'Numpad /',
	112: 'F1',
	113: 'F2',
	114: 'F3',
	115: 'F4',
	116: 'F5',
	117: 'F6',
	118: 'F7',
	119: 'F8',
	120: 'F9',
	121: 'F10',
	122: 'F11',
	123: 'F12',
	144: 'Num Lock',
	145: 'Scroll Lock',
	182: 'My Computer',
	183: 'My Calculator',
	186: ';',
	187: '=',
	188: ',',
	189: '-',
	190: '.',
	191: '/',
	192: '`',
	219: '[',
	220: '\\',
	221: ']',
	222: '\'',
	'SCROLL_WHEEL': 'Scroll'
};
