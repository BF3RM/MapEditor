ME_CONFIG = {
	LOAD_VANILLA = true,
	LOGGER_ENABLED = true,
	LOGGER_PRINT_ALL = false,

	-- Inject a loaded project's objects into the LevelData during the loading screen (native,
	-- no post-load popping). OFF: fall back to the post-load command-queue path. Injection hits an
	-- engine shader-state crash on huge saves (2500+), so we keep it off and load post-load in
	-- COMPLETION-GATED batches instead (see LOAD_BATCH_SIZE).
	LOAD_INJECTION = false,

	QUEUE_DELAY_PER_COMMAND = 0.02,
	QUEUE_MAX_COMMANDS = 50,

	-- Post-load bulk spawn is sent in batches of this size; the server waits for the client to
	-- finish (ACK) a batch before sending the next, so batches never OVERLAP/pile up (which
	-- crashed the client). Completion-gated, not time-based.
	LOAD_BATCH_SIZE = 500,

	SAVE_LOAD_DELAY = 5,

	LOADING_TIMEOUT = 1000,

	-- Boot the Gameface WebUI lazily, on the FIRST F1 (editor enter), instead of at
	-- Extension:Loaded. The booted Gameface app costs ~400-500MB inside the 32-bit client
	-- process; on heavy maps whose load already peaks near the 4GB address-space ceiling,
	-- an eagerly-booted WebUI pushes the load over it (DirectX CreateBuffer E_OUTOFMEMORY).
	-- Booting after the load spike keeps the map loadable; the editor UI appears a few
	-- seconds after the first F1 while the web app boots.
	LAZY_WEBUI = true,

	-- Dev/test: auto-enter the editor (equivalent to the first F1) once the level finishes
	-- loading, so an e2e harness can drive the editor over CDP without injecting physical input
	-- (deploy + F1). F1 still toggles back to play. Set false for pure play-testing.
	DEV_AUTO_ENTER_EDITOR = true
}
