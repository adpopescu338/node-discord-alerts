import { AlertsClient } from 'client';
import { Embed } from 'types';
import { stringify } from 'utils/stringify';
import fs from 'fs';
import path from 'path';

const DISCORD_LIMITS = {
  EMBED_TOTAL_CHARS: 6000,
  EMBED_MAX_FIELDS: 25,
  TITLE: 256,
  DESCRIPTION: 4096,
  FOOTER: 2048,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  MAX_EMBEDS_PER_PAYLOAD: 10,
};

const len = (input: unknown) => {
  if (!input) return 0;
  if (typeof input === 'string') return input.length;
  if (typeof input === 'number') return input.toString().length;
  if (Array.isArray(input)) return input.length;
  if (typeof input === 'object') return stringify(input).length;
  throw new Error(`Invalid input type ${stringify(input)}`);
};

let receivedBatches: unknown[] = [];

// @ts-expect-error
global.fetch = (...args: Parameters<typeof fetch>) => {
  const { body } = args[1] || {};

  if (!body) {
    throw new Error('No body provided');
  }

  if (len(body) > DISCORD_LIMITS.EMBED_TOTAL_CHARS) {
    throw new Error(
      `Body exceeds maximum length of ${DISCORD_LIMITS.EMBED_TOTAL_CHARS} characters`,
    );
  }

  const json = JSON.parse(body as string);
  const { embeds } = json;
  if (embeds.length > DISCORD_LIMITS.MAX_EMBEDS_PER_PAYLOAD) {
    throw new Error(
      `Embeds exceed maximum length of ${DISCORD_LIMITS.MAX_EMBEDS_PER_PAYLOAD} embeds`,
    );
  }

  embeds.forEach((embed: Embed) => {
    if (len(embed.title) > DISCORD_LIMITS.TITLE) {
      throw new Error(
        `Embed title exceeds maximum length of ${DISCORD_LIMITS.TITLE} characters`,
      );
    }

    if (len(embed.description) > DISCORD_LIMITS.DESCRIPTION) {
      throw new Error(
        `Embed description exceeds maximum length of ${DISCORD_LIMITS.DESCRIPTION} characters`,
      );
    }

    if (len(embed.footer) > DISCORD_LIMITS.FOOTER) {
      throw new Error(
        `Embed footer exceeds maximum length of ${
          DISCORD_LIMITS.FOOTER
        } characters, ${len(embed.footer)}`,
      );
    }

    if (len(embed.fields) > DISCORD_LIMITS.EMBED_MAX_FIELDS) {
      throw new Error(
        `Embed fields exceed maximum length of ${DISCORD_LIMITS.EMBED_MAX_FIELDS} fields`,
      );
    }

    embed.fields.forEach(field => {
      if (len(field.name) > DISCORD_LIMITS.FIELD_NAME) {
        throw new Error(
          `Embed field name exceeds maximum length of ${DISCORD_LIMITS.FIELD_NAME} characters`,
        );
      }

      if (len(field.value) > DISCORD_LIMITS.FIELD_VALUE) {
        throw new Error(
          `Embed field value exceeds maximum length of ${DISCORD_LIMITS.FIELD_VALUE} characters`,
        );
      }

      receivedBatches.push(json);
    });
  });

  console.log('global fetch', args);
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
};

const client = new AlertsClient({
  webhookUrl: 'https://example.com/webhook',
  logger: console,
  label: 'test',
  env: 'test',
});

client.addAlert({
  title: 'Test alert',
  description: 'This is a test alert',
  level: 'info',
  context: {
    key1: 'value1',
    key2: 'value2',
  },
});
client.addAlert({
  title: 'Test alert 2'.repeat(1000),
  description: 'This is a test alert 2'.repeat(1000),
  level: 'info',
  footer: 'This is a test footer'.repeat(1000),
  context: new Array(100).fill({ key1: 'value1', key2: 'value2' }),
});

client.addAlert({
  title: 'Test alert 3',
  description: 'This is a test alert 3'.repeat(1000),
  level: 'info',
  footer: 'This is a test footer'.repeat(1000),
  context: {
    ['key1'.repeat(1000)]: 'value1',
    key2: 'value2'.repeat(1000),
  },
});

await client.flush();

console.log('Received batches count:', receivedBatches.length);

fs.writeFileSync(
  path.join(process.cwd(), 'src/tests', 'received-batches.json'),
  JSON.stringify(receivedBatches, null, 2),
);
