# @springrole/logger
Logger for cloudwatch, loggly and sentry. Used in trivia and trivia related projects mainly.

## Get started
This is a simple logger package that can be used to log messages and errors to cloudwatch, loggly and sentry. By default, locally only console is the available transport. For other environments, optionally loggly can be enabled. Sentry is also optional.

### Installation
```console
    npm install --save @springrole/logger
```

---

### Usage
```javascript
    const Logger = require('@springrole/logger');
    const app = new Express(); 

    // get logger instance
    const logger = new Logger();
    
    const LOGGLY_TOKEN = "loggly-write-token";
    // initialize transports
    // loggly token, if not needed, pass null.
    // default level(debug) and tag(trivia) are optional. 
    logger.initializeTransports(LOGGLY_TOKEN, "warn", "lounge");
    
    // NOTE: do this only for environments you need.
    // Initialize sentry
    const SENTRY_DSN = "sentry-dsn-for-project";
    // first param is the express router, second is the sentry dsn
    // ignoreErrors([]) and tracing sampling rate(0.5) are optional.
    logger.initializeSentry(app, SENTRY_DSN, ["connect ECONNRESET"], 0.8)
```
