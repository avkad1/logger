# @springrole/logger

Logger for cloudwatch, loggly and sentry. Used in trivia and trivia related projects mainly.

## Get started

This is a simple logger package that can be used to log messages and errors to cloudwatch, loggly and sentry. By default, locally only console is the available transport. For other environments, optionally loggly can be enabled. Sentry is also optional.

### Installation

```console
    npm install --save @springrole/logger

    // OR

    yarn add @springrole/logger
```

---

### Usage

```javascript
const Logger = require("@springrole/logger");
const app = new Express();

// get logger instance
const logger = new Logger();

// initialize transports
// loggly token, if not needed, pass null.
// default level and tag are required.
// forceConsole is optional. If true, console transport will be enabled even in production.
logger.initializeTransports("warn", "lounge", false);

// NOTE: do this only for environments you need.
// Initialize sentry
const SENTRY_DSN = "sentry-dsn-for-project";
// first param is the express router, second is the sentry dsn
// ignoreErrors([]) and tracing sampling rate(0.5) are optional.
// all of the bwlow are optional
// ignoreUrls - array of urls to ignore or skipped from tracing. By default /health is ignored
// customUrls - array of urls to be traced with a different sampling rate than default.
// customSamplingRate - sampling rate for customUrls
logger.initializeSentry(app, SENTRY_DSN, ["connect ECONNRESET"], 0.8, {
  ignoreUrls: [], // tracing set to 0; optional
  customURLs: [], // tracing set to value passed in; optional
  customURLsSampleRate: 0.25, // tracing set to 0.25 for all urls in customURLs; optional - defaults to 0.1
});
```
