ME_CONFIG = {
	LOAD_VANILLA = true,
	LOGGER_ENABLED = false,
	LOGGER_PRINT_ALL = false,

	-- Inject a loaded project's objects into the LevelData during the loading screen (native,
	-- no post-load popping) instead of streaming them as runtime commands. Escape hatch: set
	-- false to fall back to the proven command-queue path if injection ever misbehaves.
	LOAD_INJECTION = true,

	QUEUE_DELAY_PER_COMMAND = 0.02,
	QUEUE_MAX_COMMANDS = 50,

	SAVE_LOAD_DELAY = 5,

	LOADING_TIMEOUT = 1000
}
