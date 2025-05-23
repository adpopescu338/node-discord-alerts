# node-discord-alerts

A simple TypeScript library to send alerts to Discord channels using webhooks, with batching, truncation, and environment support.

## Features

- Send alerts to Discord via webhook using embeds
- Batching to avoid rate limits
- Automatic truncation of long fields
- Context fields for extra data
- Customizable logger and environment labels
- Lazy-loading client for async env var loading

## Installation

```sh
npm install node-discord-alerts
```

## Usage

### Basic AlertsClient

```ts
import { AlertsClient } from 'node-discord-alerts';

const client = new AlertsClient({
  webhookUrl: process.env.ALERTS_WEBHOOK_URL!,
  label: 'my-app',
  env: process.env.NODE_ENV,
  logger: console,
});

client.addAlert({
  title: 'Something happened!',
  description: 'This is an info alert.',
  level: 'info',
  context: {
    userId: 123,
    action: 'login',
  },
});

await client.flush(); // Send all queued alerts immediately
```

### Lazy Loading Client

Use this if your webhook URL or env vars are loaded asynchronously.

```ts
import { LazyLoadingAlertsClient } from 'node-discord-alerts';

const lazyClient = new LazyLoadingAlertsClient(console);

// You can call addAlert before initialization; alerts are queued
lazyClient.addAlert({
  title: 'Startup event',
  description: 'App is starting...',
  level: 'info',
});

// Later, when env vars are ready:
lazyClient.init({
  webhookUrl: process.env.ALERTS_WEBHOOK_URL!,
  label: 'my-app',
  env: process.env.NODE_ENV,
  logger: console,
});
```

## Alert Options

See [`AlertInput`](src/types.ts):

- `title` (string, max 256 chars)
- `description` (string, max 4096 chars)
- `footer` (string, max 2048 chars)
- `context` (object, up to 25 key-value pairs, keys max 256 chars, values max 1024 chars)
- `level` (`'info' | 'warn' | 'error' | 'fatal'`)

## Advanced

### Custom Logger

You can provide your own logger with `info`, `warn`, and `error` methods.

```ts
const logger = {
  info: msg => {/* ... */},
  warn: msg => {/* ... */},
  error: msg => {/* ... */},
};

const client = new AlertsClient({
  webhookUrl: '...',
  logger,
});
```

### Disabling Alerts

Disable sending alerts (useful for local/dev):

```ts
const client = new AlertsClient({
  webhookUrl: '...',
  logger: console,
  disabled: true,
});
```

### Custom Configs

Override truncation suffix or batch timeout:

```ts
const client = new AlertsClient({
  webhookUrl: '...',
  logger: console,
  configs: {
    TRUNCATED_SUFFIX: '[truncated]',
    DEFAULT_TIMEOUT_MS: 5000,
  },
});
```

## Types

See [src/types.ts](src/types.ts) for all exported types.

---

MIT License