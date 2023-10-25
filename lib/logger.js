const winston = require("winston");
const Cloudwatch = require("winston-cloudwatch");
const isEmpty = require("lodash.isempty");
const omit = require("lodash.omit");
const sentry = require("@sentry/node");
const tracing = require("@sentry/tracing");
const { default: axios } = require("axios");

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
    this.webhookUrl = null;
  }
  #sentry = null;

  /**
   * Initialize winston logger.
   * @param {String} defaultLevel default log level
   * @param {String} tag default tag for loggly/cloudwatch. Defaults to "trivia"
   * @param {Boolean} [forceConsole] optional Force console transport
   * @param {String} [webhookUrl = null] webhook url to post logger errors
   * @param {String} [webhookColor = "#b52626"] webhook colour, needs to be a hex code, red by default
   */
  initializeTransports(
    defaultLevel,
    tag,
    forceConsole = false,
    webhookUrl = null,
    webhookColor = "#b52626",
    awsRegion = "us-east-1"
  ) {
    if (!defaultLevel || !tag) {
      throw new Error("defaultLevel and tag are required");
    }
    const transports = [];
    this.level = defaultLevel;
    this.webhookUrl = webhookUrl;
    this.webhookColor = webhookColor;
    this.tag = tag;
    if (["test", "localhost"].includes(process.env.NODE_ENV) || forceConsole) {
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
      transports.push(
        new Cloudwatch({
          logGroupName: `${tag}-${process.env.NODE_ENV}`,
          logStreamName: function () {
            // Spread log streams across dates as the server stays up
            const date = new Date().toISOString().split("T")[0];
            return `${tag}-${date}`;
          },
          awsRegion,
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
   * @param {Array<String>} [ignoreErrors = []] list of errors to ignore. Defaults to []
   * @param {Number} [tracesSampleRate = 0.25] traces sample rate. Default to 0.25
   * @param {object} [options={}] has ignoreURLs, customURLs and customURLsSampleRate
   * @param {Array<String>} [options.ignoreURLs = []] list of URLs to ignore/skip for trace sampling. Defaults to []
   * @param {Array<String>} [options.customURLs = []] list of URLs to apply custom sampling rate to. Defaults to []
   * @param {Number} [options.customURLsSampleRate = 0.1] sampling rate for custom urls. Defaults to 0.1
   */
  initializeSentry(
    app,
    dsn,
    ignoreErrors = [],
    tracesSampleRate = 0.25,
    { ignoreURLs = [], customURLs = [], customURLsSampleRate = 0.1 } = {}
  ) {
    if (!this.#sentry) {
      sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        ignoreErrors,
        integrations: [
          new sentry.Integrations.Http({ tracing: true }),
          new tracing.Integrations.Express({ app }),
        ],
        tracesSampler: (context) => {
          const skipURLs = ["/health", ...ignoreURLs];
          const url = context?.request?.url;
          const isOptionsCall = context?.request?.method === "OPTIONS";
          let sampleRate = tracesSampleRate;
          if (
            skipURLs.some((endpoint) => url?.includes(endpoint)) ||
            isOptionsCall
          ) {
            sampleRate = 0;
          } else if (customURLs.some((endpoint) => url?.includes(endpoint))) {
            sampleRate = customURLsSampleRate;
          }
          return sampleRate;
        },
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
    if (typeof error === "string") {
      return `${error?.toString()}.`;
    }
    return `[ERROR] ${message} ${error?.toString()}. Stack:\n${error?.stack}`;
  }

  #customFormat(message, eventType) {
    if (eventType && message) {
      return `${eventType}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (eventType) {
      return eventType;
    }
    return "";
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
    if (this.webhookUrl) {
      this.postWebhookAlert(err, message, eventType, payload);
    }
    if (this.#sentry) {
      this.#sentry.captureException(err, { extra: { ...payload } });
    }
    this.logger.error(
      this.#formatError(err, this.#customFormat(message, eventType)),
      payload
    );
  }

  /**
   * Post Webhook Alert for errors
   * @param {Error} err error to post alert on
   * @param {String} message message to log
   * @param {String} eventType from event/function
   * @param {Object} [payload = {}] additional payload
   * @param {String} [webhookUrl=null] webhook url to post alert on; overrides default webhook url
   * @returns {Promise<void>}
   */
  async postWebhookAlert(
    err,
    message,
    eventType,
    payload = {},
    webhookUrl = null
  ) {
    try {
      if (!this.webhookUrl && !webhookUrl) {
        return;
      }

      const format = (text) => `\`${text}\``;
      const stringify = (ob) => JSON.stringify(ob, null, 1);
      const codify = (field, isCode) =>
        isCode ? `\`\`\`${field}\`\`\`` : field;
      const capitalize = (text) =>
        typeof text === "string"
          ? text.charAt(0).toUpperCase() + text.slice(1)
          : text;

      const pretext = `*${this.#customFormat(
        message,
        eventType
      )}*\n${err?.toString()}`;

      const fields = [
        {
          title: "Please find details below:",
          value: {
            environment: format(process.env.NODE_ENV),
            message: err?.message,
          },
        },
        {
          title: "Payload",
          code: true,
          value: { payload: stringify(payload) },
        },
      ];
      if (err?.stack) {
        fields.push({
          title: "Stack Trace",
          code: true,
          value: { stack: err.stack },
        });
      }

      const attachments = [
        {
          fallback: "Alert Event",
          pretext,
          color: this.webhookColor,
          fields: fields.map((field) => ({
            title: field.title,
            short: false,
            value: Object.keys(field.value)
              .map((k) =>
                ![null, undefined].includes(field.value[k])
                  ? `*${capitalize(k)}*: ${codify(
                      field.value[k],
                      field.code
                    )}\n`
                  : ""
              )
              .join(""),
          })),
        },
      ];
      await axios.post(
        webhookUrl ?? this.webhookUrl,
        { attachments },
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      // ignore error
    }
  }
}

module.exports = Logger;
