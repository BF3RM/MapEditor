/**
 * What the editor is doing while a level comes in, and what it is waiting on.
 *
 * A cold level takes minutes standalone: every mesh and texture is extracted from the game one at
 * a time. Until it finishes the viewport shows white geometry and empty ground, which reads as a
 * broken editor rather than a busy one -- and the parts arrive in an order nobody can guess
 * (terrain before statics, geometry before its textures). This says which stage is running, what
 * has arrived, and hints at the things that are surprising rather than wrong.
 *
 * It reads live counters instead of being told: whatever finishes, finishes, and the panel keeps
 * up without every loader having to report in.
 */

const HINTS = [
	'First load of a level extracts every mesh and texture from the game — later loads are instant.',
	'Right-drag looks, middle-drag pans, wheel zooms. Left-click selects.',
	'White objects have their geometry but not their textures yet — those stream in one at a time.',
	'FX meshes are never drawn: they are particle emitters, not geometry.',
	'Roads are ribbons painted on the terrain, not meshes — they arrive separately.',
	'Terrain streams coarse-to-fine, so the ground sharpens as its tiles land.'
];

const HINT_EVERY = 7000;
const POLL_EVERY = 500;
/** Quiet for this long, with something loaded, and the level is considered in. */
const SETTLED_AFTER = 6000;

export class StandaloneProgress {
	private panel: HTMLDivElement | null = null;
	private body: HTMLDivElement | null = null;
	private hint: HTMLDivElement | null = null;
	private timer = 0;
	private hintTimer = 0;
	private hintIndex = 0;
	private lastSignature = '';
	private quietSince = 0;

	public start(level: string): void {
		this.stop();

		const panel = document.createElement('div');
		panel.id = 'standalone-progress';
		panel.style.cssText = [
			'position:fixed', 'left:16px', 'bottom:16px', 'z-index:9999',
			'background:rgba(18,20,23,0.92)', 'color:#d8dade', 'padding:12px 14px',
			'border-radius:6px', 'font:12px/1.55 system-ui,sans-serif',
			'min-width:260px', 'max-width:360px', 'pointer-events:none',
			'box-shadow:0 6px 20px rgba(0,0,0,0.45)'
		].join(';');

		const title = document.createElement('div');
		title.textContent = 'Loading ' + level.split('/').pop();
		title.style.cssText = 'font-weight:600;margin-bottom:6px;color:#fff';

		this.body = document.createElement('div');
		this.hint = document.createElement('div');
		this.hint.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid #333;color:#9aa0a6';

		panel.appendChild(title);
		panel.appendChild(this.body);
		panel.appendChild(this.hint);
		document.body.appendChild(panel);
		this.panel = panel;

		this.hintIndex = 0;
		this.showHint();
		this.hintTimer = window.setInterval(() => this.showHint(), HINT_EVERY);
		this.timer = window.setInterval(() => this.tick(), POLL_EVERY);
	}

	public stop(): void {
		if (this.timer) {
			window.clearInterval(this.timer);
			this.timer = 0;
		}

		if (this.hintTimer) {
			window.clearInterval(this.hintTimer);
			this.hintTimer = 0;
		}

		if (this.panel !== null && this.panel.parentElement !== null) {
			this.panel.parentElement.removeChild(this.panel);
		}

		this.panel = null;
	}

	private showHint(): void {
		if (this.hint === null) {
			return;
		}

		this.hint.textContent = HINTS[this.hintIndex % HINTS.length];
		this.hintIndex++;
	}

	private tick(): void {
		const editor = (window as any).editor;
		const meshes = (window as any).meshes;

		if (editor === undefined || this.body === null) {
			return;
		}

		const scene = editor.threeManager.scene;
		const count = (name: string): number => {
			const group = scene.getObjectByName(name);
			return group ? group.children.length : 0;
		};

		// gameObjects is their Dictionary, whose `size` is a METHOD -- reading it as a property
		// printed the function's source into the panel. Call it if callable, else count the values.
		let objects = 0;

		if (editor.gameObjects) {
			const size = editor.gameObjects.size;
			objects = typeof size === 'function'
				? editor.gameObjects.size()
				: (typeof size === 'number' ? size : (editor.gameObjects.values() || []).length);
		}
		const stats = meshes && meshes.stats ? meshes.stats : { attached: 0, missing: 0 };
		const rows: Array<[string, string]> = [
			['Objects', String(objects)],
			['Meshes drawn', String(stats.attached)],
			['Terrain tiles', String(count('terrain'))],
			['Roads', String(count('roads'))]
		];

		this.body.innerHTML = rows.map(([k, v]) =>
			'<div style="display:flex;justify-content:space-between;gap:18px">' +
			'<span>' + k + '</span><span style="color:#fff">' + v + '</span></div>'
		).join('');

		// Nothing has moved for a while and something did arrive -> the level is in.
		const signature = rows.map((r) => r[1]).join('|');
		const now = Date.now();

		if (signature !== this.lastSignature) {
			this.lastSignature = signature;
			this.quietSince = now;
			return;
		}

		if (objects > 0 && now - this.quietSince > SETTLED_AFTER) {
			this.stop();
		}
	}
}
