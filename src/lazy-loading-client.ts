import { AlertsClient } from './client';
import type { AlertInput, AlertsClientOptions, Logger } from './types';
import { stringify } from './utils/stringify';

/**
 * Proxy wrapper around AlertsClient that defers initialization until environment variables are available.
 *
 * The main reason for this proxy pattern is that environment variables like ALERTS_WEBHOOK_URL
 * might be pulled asynchronously from external systems and might not be immediately available when the module loads.
 * This allows us to:
 * 1. Create the alerts client instance immediately on module load
 * 2. Queue any alert calls (with warning logs) before initialization
 * 3. Defer actual client initialization until we're sure all env vars are available
 * 4. Initialize the real client by calling init() when ready
 *
 * Queue behavior:
 * - All alerts called before initialization are stored in an internal queue
 * - If flush() is called before initialization, it's tracked
 * - Upon initialization:
 *   1. All queued alerts are sent to the real client in order
 *   2. If flush() was called, it will be executed after processing the queue
 */
export class LazyLoadingAlertsClient {
  private client: AlertsClient | null = null;
  private queuedAlerts: AlertInput[] = [];
  private flushRequested = false;
  private logger: Logger;
  constructor(logger: Logger = console) {
    this.logger = logger;
  }

  private logNotInitialized(method: string, args?: unknown) {
    if (args) {
      this.logger.warn(
        `Alerts client not initialized. ${method} called with ${stringify(
          args,
        )}`,
      );
    } else {
      this.logger.warn(`Alerts client not initialized. ${method} called`);
    }
  }

  private async processQueue() {
    if (!this.client || this.queuedAlerts.length === 0) {
      return;
    }

    this.logger.info(`Processing ${this.queuedAlerts.length} queued alerts`);

    for (const alert of this.queuedAlerts) {
      this.client.addAlert(alert);
    }

    this.queuedAlerts = [];

    if (this.flushRequested) {
      await this.client.flush();
      this.flushRequested = false;
    }
  }

  public init(config: AlertsClientOptions) {
    if (this.client) {
      this.logger.warn('Alerts client already initialized');
      return;
    }

    this.client = new AlertsClient(config);

    this.logger.info('Alerts client initialized');
    void this.processQueue();
  }

  // ------- OVERRIDE ORIGINAL METHODS (PROXY) -------

  public addAlert: AlertsClient['addAlert'] = alert => {
    if (this.client) {
      return this.client.addAlert(alert);
    }
    this.logNotInitialized('addAlert', alert);
    this.queuedAlerts.push(alert);
  };

  public flush: AlertsClient['flush'] = () => {
    if (this.client) {
      return this.client.flush();
    }
    this.logNotInitialized('flush');
    this.flushRequested = true;
    return Promise.resolve();
  };

  public stop: AlertsClient['stop'] = () => {
    if (this.client) {
      return this.client.stop();
    }
    this.logNotInitialized('stop');
  };
}
