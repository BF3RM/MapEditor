declare namespace WebUI {
	/**
	 * Shows the WebUI
	 */
	function Call(type: 'Show'): boolean;

	/**
	 * Hides the WebUI
	 */
	function Call(type: 'Hide'): boolean;

	/**
	 * Brings the WebUI to the front
	 */
	function Call(type: 'BringToFront'): boolean;

	/**
	 * Enables the keyboard on WebUI
	 */
	function Call(type: 'EnableKeyboard'): boolean;

	/**
	 * Enables the mouse on WebUI
	 */
	function Call(type: 'EnableMouse'): boolean;

	/**
	 * Disables the keyboard on WebUI
	 */
	function Call(type: 'DisableKeyboard'): boolean;

	/**
	 * Disables the mouse on WebUI
	 */
	function Call(type: 'DisableMouse'): boolean;

	/**
	 * Resets the keyboard state to default on WebUI
	 */
	function Call(type: 'ResetKeyboard'): boolean;

	/**
	 * Resets the mouse state to default on WebUI
	 */
	function Call(type: 'ResetMouse'): boolean;

	/**
	 * Brings WebUI to the front of the WebUI stack
	 */
	function Call(type: 'BringToFront'): boolean;

	/**
	 * Brings WebUI to the bacmk of the WebUI stack
	 */
	function Call(type: 'BringToBack'): boolean;

	/**
	 * Dispatches an event
	 * @param event Event to dispatch
	 */
	function Call(type: 'DispatchEvent', event: any): boolean;

	/**
	 * Dispatches an local event
	 * @param event Event to dispatch
	 * @param args  Optional event arguments
	 */
	function Call(type: 'DispatchEventLocal', event: string, ...args: any[]): boolean;

	// /**
	//  * Calls an WebUI function
	//  * @param type Function to call
	//  * @param args Optional function arguments
	//  */
	// function Call(type: string, ...args: any[]): boolean;

	// function _isDebug(): boolean;
}
