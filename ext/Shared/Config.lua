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

	LOADING_TIMEOUT = 1000
}
