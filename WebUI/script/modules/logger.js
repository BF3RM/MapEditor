class Logger {
    // 0 none
    // 1 debug
    // 2 verbose

    constructor(logLevel) {
        this.logLevel = logLevel;
    }

    static LogError(message) {
        console.error(message)
    }
    Log(level, message) {
        if(level <= this.logLevel) {
            console.log(message)
        }
    }
}