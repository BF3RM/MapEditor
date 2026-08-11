/**
 * @author dforrer / https://github.com/dforrer
 * Developed as part of a project at University of Applied Sciences and Arts Northwestern Switzerland (www.fhnw.ch)
 */

import { signals } from '../../modules/Signals';
import { LogError } from '../../modules/Logger';

export default class History {
	constructor(editor) {
		this.editor = editor;
		this.undos = [];
		this.redos = [];
		this.lastCmdTime = new Date();
		this.idCounter = 0;

		this.historyDisabled = false;
		this.config = editor.config;

		// True while goToState is walking the stack: suppresses the per-step historyChanged
		// (see emitChanged) and lets listeners tell time-travel apart from a new action.
		this.suppressSignal = false;
		this.timeTravelling = false;

		// Set editor-reference in Command

		// signals

		const scope = this;
	}

	execute(cmd, optionalName) {
		const lastCmd = this.undos[ this.undos.length - 1 ];
		const timeDifference = new Date().getTime() - this.lastCmdTime.getTime();

		// Merge consecutive edits of the SAME field into one history entry (three.js's
		// updatable-command optimisation). The original predicate compared `object`, `script` and
		// `attributeName` — none of which exist on this port's Command — so every comparison was
		// `undefined === undefined` and the guard was meaningless. Compare a real mergeKey instead;
		// commands that don't set one (mergeKey undefined) never merge.
		const isUpdatableCmd = lastCmd &&
			lastCmd.updatable &&
			cmd.updatable &&
			lastCmd.type === cmd.type &&
			lastCmd.mergeKey !== undefined &&
			lastCmd.mergeKey === cmd.mergeKey;
		if (isUpdatableCmd && timeDifference < 500) {
			lastCmd.update(cmd);
			cmd = lastCmd;
		} else {
			// the command is not updatable and is added as a new part of the history

			this.undos.push(cmd);
			cmd.id = ++this.idCounter;
		}
		cmd.name = (optionalName !== undefined) ? optionalName : cmd.name;
		cmd.execute();
		cmd.inMemory = true;

		this.lastCmdTime = new Date();

		// clearing all the redo-commands

		this.redos = [];
		signals.historyChanged.emit(cmd);
	}

	undo() {
		var cmd;

		if (this.undos.length > 0) {
			cmd = this.undos.pop();

			if (cmd.inMemory === false) {
				cmd.fromJSON(cmd.json);
			}
		}

		if (cmd !== undefined) {
			cmd.undo();
			this.redos.push(cmd);
			this.emitChanged(cmd);
		}

		return cmd;
	}

	redo() {
		var cmd;

		if (this.redos.length > 0) {
			cmd = this.redos.pop();

			if (cmd.inMemory === false) {
				cmd.fromJSON(cmd.json);
			}
		}

		if (cmd !== undefined) {
			cmd.execute();
			this.undos.push(cmd);
			this.emitChanged(cmd);
		}

		return cmd;
	}

	/**
	 * Emit historyChanged unless a multi-step walk (goToState) is in progress.
	 *
	 * The three.js original suppressed these with `signals.historyChanged.active = false`, but
	 * that was a feature of the signals.js library it used. This port uses typed-signals, which
	 * has NO `active` property — so every one of those suppression statements was a silent no-op
	 * and a 40-step walk emitted 41 times, each triggering a full re-render of both history lists.
	 * That is quadratic, and in Cohtml it stalls the UI long enough to look like the click went
	 * to the wrong step.
	 */
	emitChanged(cmd) {
		if (this.suppressSignal) {
			return;
		}

		signals.historyChanged.emit(cmd);
	}

	toJSON() {
		const history = {};
		history.undos = [];
		history.redos = [];

		// Append Undos to History

		for (var i = 0; i < this.undos.length; i++) {
			if (this.undos[ i ].hasOwnProperty('json')) {
				history.undos.push(this.undos[ i ].json);
			}
		}

		// Append Redos to History

		for (var i = 0; i < this.redos.length; i++) {
			if (this.redos[ i ].hasOwnProperty('json')) {
				history.redos.push(this.redos[ i ].json);
			}
		}

		return history;
	}

	fromJSON(json) {
		if (json === undefined) return;

		for (var i = 0; i < json.undos.length; i++) {
			var cmdJSON = json.undos[ i ];
			var cmd = new window[ cmdJSON.type ]();	// creates a new object of type "json.type"
			cmd.json = cmdJSON;
			cmd.id = cmdJSON.id;
			cmd.name = cmdJSON.name;
			this.undos.push(cmd);
			this.idCounter = (cmdJSON.id > this.idCounter) ? cmdJSON.id : this.idCounter; // set last used idCounter
		}

		for (var i = 0; i < json.redos.length; i++) {
			var cmdJSON = json.redos[ i ];
			var cmd = new window[ cmdJSON.type ]();	// creates a new object of type "json.type"
			cmd.json = cmdJSON;
			cmd.id = cmdJSON.id;
			cmd.name = cmdJSON.name;
			this.redos.push(cmd);
			this.idCounter = (cmdJSON.id > this.idCounter) ? cmdJSON.id : this.idCounter; // set last used idCounter
		}

		// Select the last executed undo-command
		signals.historyChanged.emit(this.undos[ this.undos.length - 1 ]);
	}

	clear() {
		this.undos = [];
		this.redos = [];
		// idCounter is deliberately NOT reset: goToState identifies entries purely by id, so
		// reusing ids after a clear could send you to the wrong step if any older Command object
		// is still referenced. Monotonic ids cost nothing.

		signals.historyChanged.emit();
	}

	goToState(id) {
		if (this.historyDisabled) {
			LogError('Undo/Redo disabled while scene is playing.');
			return;
		}

		// Walk the stack in ONE batch: suppress the per-step signal (see emitChanged) and pause the
		// VEXT transport so the N commands go to the ext as a single batch instead of N round-trips
		// (BulkCommand already does this for its children; this walk never did).
		this.suppressSignal = true;
		this.timeTravelling = true;
		window.vext.Pause();

		try {
			var cmd = this.undos.length > 0 ? this.undos[ this.undos.length - 1 ] : undefined;	// next cmd to pop

			if (cmd === undefined || id > cmd.id) {
				cmd = this.redo();
				while (cmd !== undefined && id > cmd.id) {
					cmd = this.redo();
				}
			} else {
				while (true) {
					cmd = this.undos[ this.undos.length - 1 ];	// next cmd to pop

					if (cmd === undefined || id === cmd.id) break;

					this.undo();
				}
			}
		} finally {
			// finally: an exception mid-walk must not leave the panel permanently mute or the
			// transport permanently paused.
			this.suppressSignal = false;
			window.vext.Resume();
		}

		signals.historyChanged.emit(cmd);
		this.timeTravelling = false;
	}

	enableSerialization(id) {
		/**
		 * because there might be commands in this.undos and this.redos
		 * which have not been serialized with .toJSON() we go back
		 * to the oldest command and redo one command after the other
		 * while also calling .toJSON() on them.
		 */

		this.goToState(-1);

		this.suppressSignal = true;

		var cmd = this.redo();
		while (cmd !== undefined) {
			if (!cmd.hasOwnProperty('json')) {
				cmd.json = cmd.toJSON();
			}
			cmd = this.redo();
		}

		this.suppressSignal = false;

		this.goToState(id);
	}
};
