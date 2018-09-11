class Logger {
    // 0 none
    // 1 debug
    // 2 verbose

    constructor(logLevel) {
        this.logLevel = logLevel;
    }

    LogError(message) {
        console.error(message)
    }
    Log(level, message) {
        if(typeof (level) != "number") {
            this.LogError("Log statement is missing level. Consider fixing that.");
            console.log(level);
            return false;
        }
        if(level <= this.logLevel) {
            console.log(message)
        }
    }
}