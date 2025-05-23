import {
  alertToEmbeds,
  EmbedWithCharCount,
  fillBatch,
} from 'utils/size-adjusting';
import type { AlertInput, Logger, AlertsClientOptions } from './types';
import { stringify } from './utils/stringify';

/**
 * Batches alerts and sends them to discord webhook using embeds to avoid rate limiting
 */
export class AlertsClient {
  private TRUNCATED_SUFFIX = '...';
  private BATCH_SIZE = 10;
  private webhookUrl: string;
  private label?: string;
  private env?: string;
  private DEFAULT_TIMEOUT_MS = 1000 * 10; // 10 seconds
  private embeds: EmbedWithCharCount[] = [];
  private timeoutId: NodeJS.Timeout | null = null;
  private logger: Logger;
  private disabled?: boolean;

  private isSending = false;
  private isFlushing = false;
  constructor({
    webhookUrl,
    label,
    env,
    logger,
    disabled,
    configs = {},
  }: AlertsClientOptions) {
    this.webhookUrl = webhookUrl;
    this.label = label;
    this.env = env;
    this.logger = logger;
    this.disabled = disabled;

    if (configs.TRUNCATED_SUFFIX) {
      this.TRUNCATED_SUFFIX = configs.TRUNCATED_SUFFIX;
    }

    if (configs.DEFAULT_TIMEOUT_MS) {
      this.DEFAULT_TIMEOUT_MS = configs.DEFAULT_TIMEOUT_MS;
    }
  }

  public addAlert(alert: AlertInput) {
    if (this.isFlushing) {
      this.logger.info(
        `Flushing alerts, skipping new alert: ${stringify(alert)}`,
      );

      return;
    }

    this.embeds.push(...alertToEmbeds(alert, this.TRUNCATED_SUFFIX));

    if (!this.timeoutId && !this.isSending) {
      this.timeoutId = setTimeout(
        this.sendAlertsBatch.bind(this),
        this.DEFAULT_TIMEOUT_MS,
      );
    }
  }

  private async sendAlertsBatch(timeoutOverrideMs?: number) {
    if (!this.embeds.length) return 0;

    this.isSending = true;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const batch = fillBatch(this.embeds, this.BATCH_SIZE);

    this.embeds.slice(0, batch.length);

    if (this.disabled) {
      this.logger.info(`Alerts disabled, skipping batch: ${stringify(batch)}`);
    } else {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: stringify({
          embeds: batch,
          content: `**${this.label} | ${this.env}**`,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter) : 30;
          const timeoutMs = retryAfterSeconds * 1000;
          this.timeoutId = setTimeout(
            this.sendAlertsBatch.bind(this),
            timeoutMs,
          );
          this.logger.info(
            `Rate limit exceeded. Retrying in ${retryAfterSeconds} seconds`,
          );

          this.isSending = false;
          return timeoutMs;
        }

        const errorMessage = await res.text().catch(() => null);
        this.logger.error(`Failed to send alerts batch: ${errorMessage}`);
      }
    }

    this.embeds = this.embeds.slice(this.BATCH_SIZE);
    this.logger.info(`Sent ${batch.length} alerts`);
    if (this.embeds.length) {
      const timeoutMs = timeoutOverrideMs || this.DEFAULT_TIMEOUT_MS;
      this.timeoutId = setTimeout(this.sendAlertsBatch.bind(this), timeoutMs);

      return timeoutMs;
    }

    this.isSending = false;
    return 0;
  }

  public async flush() {
    if (this.isFlushing) {
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (!this.isFlushing) {
            clearInterval(interval);
            resolve(true);
          }
        }, 1000);
      });
    }

    this.isFlushing = true;

    while (this.embeds.length) {
      const timeoutMs = await this.sendAlertsBatch(5_000); // 5 seconds
      if (timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, timeoutMs));
      }
    }

    this.isFlushing = false;
  }

  /**
   * Stops the alerts client from sending alerts. Only to use during tests.
   */
  public stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}
