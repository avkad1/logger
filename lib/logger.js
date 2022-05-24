const winston = require("winston");
const crypto = require("crypto");
const { Loggly } = require("winston-loggly-bulk");
const Cloudwatch = require("winston-cloudwatch");
const isEmpty = require("lodash.isempty");
const omit = require("lodash.omit");
const sentry = require("@sentry/node");
const tracing = require("@sentry/tracing");

const config = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    debug: "blue",
  },
};

const UNINITIALIZED_ERROR = "Logger is not initialized";

class Logger {
  constructor() {
    this.level = "debug";
    this.logger = null;
  }
  #sentry = null;

  /**
   * Initialize winston logger.
   * @param {String} [logglyToken] optional loggly token for loggly logging
   * @param {String} [defaultLevel = "debug"] default log level
   * @param {String} [tag = 'trivia'] default tag for loggly/cloudwatch. Defaults to "trivia"
   */
  initializeTransports(logglyToken, defaultLevel = "debug", tag = "trivia") {
    const transports = [];
    this.level = defaultLevel;
    if (process.env.NODE_ENV === "localhost") {
      transports.push(
        new winston.transports.Console({
          level: this.level,
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(this.#formatMessage)
          ),
        })
      );
    } else {
      if (logglyToken) {
        transports.push(
          new Loggly({
            token: logglyToken,
            subdomain:
              process.env.NODE_ENV === "production"
                ? tag
                : `${process.env.NODE_ENV}-${tag}`,
            tags: [tag, process.env.NODE_ENV],
            json: true,
            stripColors: true,
            level: this.level,
          })
        );
      }
      transports.push(
        new Cloudwatch({
          logGroupName: `${tag}-${process.env.NODE_ENV}`,
          logStreamName: function () {
            // Spread log streams across dates as the server stays up
            const date = new Date().toISOString().split("T")[0];
            return `${tag}-${date}`;
          },
          awsRegion: "us-east-1",
          jsonMessage: true,
          level: this.level,
        })
      );
    }
    this.logger = winston.createLogger({
      levels: config.levels,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(this.#formatMessage)
      ),
      transports,
    });
  }

  /**
   * Initialize sentry
   * @param {Router} app express router
   * @param {String} dsn sentry dsn
   * @param {Array<String>} [ignoreErrors] list of errors to ignore. Defaults to []
   * @param {Number} [tracesSampleRate] traces sample rate. Default to 0.5
   */
  initializeSentry(app, dsn, ignoreErrors = [], tracesSampleRate = 0.5) {
    if (!this.#sentry) {
      sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        ignoreErrors,
        integrations: [
          new sentry.Integrations.Http({ tracing: true }),
          new tracing.Integrations.Express({ app }),
        ],
        tracesSampleRate,
      });
      this.#sentry = sentry;
    }
  }

  /**
   * Get Sentry handlers for request/tracing/error.
   * @return {{ requestHandler: function, errorHandler: function, tracingHandler: function }} handlers.
   */
  getSentryHandlers() {
    if (!this.#sentry) {
      throw new Error(UNINITIALIZED_ERROR);
    }
    return this.#sentry.Handlers;
  }

  #formatMessage(info) {
    const meta = omit(info, "timestamp", "message", "level");
    return isEmpty(JSON.parse(JSON.stringify(meta)))
      ? `${info.timestamp} ${info.level}: ${info.message}`
      : `${info.timestamp} ${info.level}: ${info.message}\n${JSON.stringify(
          meta,
          null,
          2
        )}`;
  }

  #formatError(error, message) {
    return `${message} ${error.toString()}. Stack:\n${error.stack}`;
  }

  #customFormat(message, eventType) {
    if (eventType) {
      return `${message} in ${eventType}`;
    }
    return message;
  }

  /**
   * Get Logger Level.
   * @return {string}
   */
  getLevel() {
    return this.level;
  }

  /**
   * Set logger level for all transports.
   * @param level
   */
  setLevel(level) {
    if (!this.logger) {
      throw new Error(UNINITIALIZED_ERROR);
    }
    this.level = level;
    this.logger.transports.forEach((transport) => {
      transport.level = level;
    });
  }

  /**
   * Log debug message
   * @param {String} message message to log
   * @param {String} eventType from event/function
   * @param {Object} payload additional payload
   */
  debug(message, eventType, payload = {}) {
    if (!this.logger) {
      throw new Error(UNINITIALIZED_ERROR);
    }
    this.logger.debug(this.#customFormat(message, eventType), payload);
  }

  /**
   * Log info message
   * @param {String} message message to log
   * @param {String} eventType from event/function
   * @param {Object} payload additional payload
   */
  info(message, eventType, payload = {}) {
    if (!this.logger) {
      throw new Error(UNINITIALIZED_ERROR);
    }
    this.logger.info(this.#customFormat(message, eventType), payload);
  }

  /**
   * Log warn message
   * @param {String} message message to log
   * @param {String} eventType from event/function
   * @param {Object} payload additional payload
   */
  warn(message, eventType, payload = {}) {
    if (!this.logger) {
      throw new Error(UNINITIALIZED_ERROR);
    }
    this.logger.warn(this.#customFormat(message, eventType), payload);
  }

  /**
   * Log debug message
   * @param {Error} err error to log
   * @param {String} message message to log
   * @param {String} eventType from event/function
   * @param {Object} payload additional payload
   */
  error(err, message, eventType, payload = {}) {
    if (!this.logger) {
      throw new Error(UNINITIALIZED_ERROR);
    }
    if (this.#sentry) {
      this.#sentry.captureException(err);
    }
    this.logger.error(
      this.#formatError(err, this.#customFormat(message, eventType)),
      payload
    );
  }
}

module.exports = Logger;
