/**
 * An alert is a message that is sent to a Discord channel via the embed format.
 * If Some of the properties exceed the maximum length, they will be truncated.
 * If the total size of the alert exceeds the maximum size, it will be split into multiple alerts.
 * See limits at https://discord.com/developers/docs/resources/message#embed-object-embed-limits
 */
export type AlertInput = {
  /**
   * The title of the alert.
   * Maximum length is 256 characters.
   */
  title?: string;
  /**
   * The description of the alert.
   * Maximum length is 4096 characters.
   */
  description?: string;
  /**
   * The footer of the alert.
   * Maximum length is 2048 characters.
   */
  footer?: string; // 2048 characters
  /**
   * Optional object as context for the alert.
   * It must contain up to 25 key-value pairs.
   * Each key must have a maximum length of 256 characters.
   * Each value must have a maximum length of 1024 characters.
   */
  context?: object;
  /**
   * The level of the alert. It will determine the color of the alert.
   */
  level?: 'info' | 'error' | 'warn' | 'fatal';
};

export type Embed = {
  color?: number;
  title?: string;
  description?: string;
  footer?: {
    text: string;
  };
  timestamp: string;
  fields: Array<{
    name: string;
    value: string;
  }>;
};

export type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
};

export type AlertsClientOptions = {
  webhookUrl: string;
  /**
   * The label to use for the alerts. This is specially useful if you're sending alerts to a channel from multiple applications.
   */
  label?: string;
  /**
   * The environment to use for the alerts. This will be embedded in the alert. Useful if sending alerts to a single channel from multiple environments.
   */
  env?: string;
  /**
   * either `console` or a custom logger with `info` and `error` methods
   * @default console from the execution context
   */
  logger: Logger;
  /**
   * Whether to disable the alerts client. You might want to set this to true for local development or testing.
   * @default false
   */
  disabled?: boolean;

  configs?: {
    /**
     * The suffix appended to a truncated part of the alert.
     * @default '...'
     */
    TRUNCATED_SUFFIX?: string;
    /**
     * How many milliseconds to wait before sending a batch of alerts.
     * @default 10_000 (10 seconds)
     */
    DEFAULT_TIMEOUT_MS?: number;
  };
};
