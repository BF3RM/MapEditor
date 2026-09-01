/**
 * Makes the editor usable on a phone.
 *
 * The dock is three fixed columns -- hierarchy, viewport, inspector -- which needs roughly 1200px
 * before the viewport has any room left. Below that the panels become drawers that slide over the
 * viewport, one at a time, so the 3D view keeps the full screen and each panel is a tap away.
 *
 * Everything is behind a media query, so a desktop browser and the in-game WebUI (which runs at the
 * game's resolution) are untouched.
 */

const BREAKPOINT = 1000;

const CSS = `
@media (max-width: ${BREAKPOINT}px) {
	#mobile-bar { display: flex !important; }

	/* Drawers, off screen until asked for. */
	.fx-hierarchy, .fx-right {
		position: fixed !important;
		top: 84px; bottom: 0;
		width: 82vw; max-width: 360px;
		z-index: 400;
		transition: transform 0.18s ease;
		box-shadow: 0 0 24px rgba(0, 0, 0, 0.55);
	}
	.fx-hierarchy { left: 0; transform: translateX(-102%); }
	.fx-right     { right: 0; transform: translateX(102%); }

	body.m-scene .fx-hierarchy,
	body.m-inspector .fx-right { transform: translateX(0); }

	/* The project panel is the least useful on a phone, so it starts closed too. */
	.fx-bottom { display: none !important; }
	body.m-project .fx-bottom {
		display: block !important;
		position: fixed; left: 0; right: 0; bottom: 0;
		height: 45vh; z-index: 400;
		box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.55);
	}

	/* Nothing to drag when the panels are drawers. */
	.fx-divider-v, .fx-divider-h { display: none !important; }

	.fx-viewport { flex: 1 1 100% !important; }

	/* The standalone bar has to share the top with the app's own toolbar. */
	#standalone-bar {
		top: 44px !important;
		left: 4px !important; right: 4px !important;
		transform: none !important;
		flex-wrap: wrap;
		justify-content: center;
	}
	#standalone-bar span { display: none; }
	#standalone-bar select { min-width: 0 !important; flex: 1 1 40%; }
}

#mobile-bar { display: none; }

/*
 * Let the viewport receive input.
 *
 * The 3D canvas lives in its own subtree (#ViewportContainer) UNDERNEATH the dock, and .fx-top --
 * the dock's flex row -- covers it with pointer-events:auto. Every drag over the viewport landed on
 * that div instead of the canvas, so the camera could not be moved by mouse or touch: the hit test
 * at the centre of the viewport returned DIV.fx-top, never CANVAS#viewport.
 *
 * The containers pass input through; the panels themselves still take it.
 */
#glHolder, .fx-main, .fx-top { pointer-events: none !important; }

.fx-hierarchy, .fx-right, .fx-bottom,
.fx-divider-v, .fx-divider-h { pointer-events: auto !important; }
`;

const PANELS: Array<{ key: string; label: string }> = [
	{ key: 'm-scene', label: 'Scene' },
	{ key: 'm-inspector', label: 'Inspector' },
	{ key: 'm-project', label: 'Project' }
];

export class MobileLayout {
	public install(): void {
		// Standalone only, and explicitly so. In-game the WebUI runs at the game's resolution
		// inside Gameface, where none of this applies -- and the pointer-events rule below would
		// change how the dock behaves there.
		if ((window as any).debug !== true) {
			return;
		}

		if (document.getElementById('mobile-bar') !== null) {
			return;
		}

		const style = document.createElement('style');
		style.textContent = CSS;
		document.head.appendChild(style);

		const bar = document.createElement('div');
		bar.id = 'mobile-bar';
		bar.setAttribute(
			'style',
			'position:fixed;left:0;right:0;bottom:0;z-index:600;gap:6px;padding:6px;' +
				'background:rgba(18,21,28,0.96);border-top:1px solid #3a4354;justify-content:center'
		);

		for (const panel of PANELS) {
			bar.appendChild(this.button(panel.key, panel.label));
		}

		document.body.appendChild(bar);
	}

	/** One panel at a time: two drawers over a phone screen leaves no viewport. */
	private button(key: string, label: string): HTMLButtonElement {
		const button = document.createElement('button');
		button.textContent = label;
		button.setAttribute(
			'style',
			'flex:1;padding:10px 4px;border-radius:6px;border:1px solid #46506a;' +
				'background:#242b39;color:#c8d2e0;font:13px system-ui,sans-serif'
		);

		button.onclick = () => {
			const open = document.body.classList.contains(key);

			for (const panel of PANELS) {
				document.body.classList.remove(panel.key);
			}

			if (!open) {
				document.body.classList.add(key);
			}

			for (const child of Array.from(document.getElementById('mobile-bar')!.children)) {
				const element = child as HTMLElement;
				const active = document.body.classList.contains(key) && element === button;

				element.style.background = active ? '#2d6fb5' : '#242b39';
				element.style.borderColor = active ? '#4a90d9' : '#46506a';
			}

			// The viewport changed size under the drawer.
			window.dispatchEvent(new Event('resize'));
		};

		return button;
	}
}
