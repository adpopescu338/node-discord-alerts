/*
 * Utility helpers for turning an `AlertInput` object into one or more Discord `Embed`s
 * that obey **all** the documented limits:
 *   – 6000 chars total per embed (title + description + footer + all fields)
 *   – ≤ 25 fields per embed
 *   – 256 chars for title & every field name
 *   – 1 024 chars for every field value
 *   – 4 096 chars for description
 *   – 2 048 chars for footer
 *
 * If the resulting data do not fit into a single embed the function will split the
 * alert intelligently across as many embeds as necessary, re‑using the same `alertId`
 * field on each piece so that downstream consumers can correlate them again.
 *
 * **Public API**
 * ```ts
 * import { alertToEmbeds } from "./embed-utils";
 * const embeds = alertToEmbeds(alertInput);
 * ```
 */

export type EmbedWithCharCount = Embed & { charsCount: number };

import { randomUUID } from 'crypto';
import { AlertInput, Embed } from 'types';
import { getColorForLevel } from './get-color-for-level';
import { stringify } from './stringify';

/** Discord hard limits extracted from the docs. Slightly resized */
export const DISCORD_LIMITS = {
  EMBED_TOTAL_CHARS: 6000 - 100,
  EMBED_MAX_FIELDS: 25,
  TITLE: 256 - 56,
  DESCRIPTION: 4096 - 96,
  FOOTER: 2048 - 48,
  FIELD_NAME: 256 - 16,
  FIELD_VALUE: 1024 - 24,
  MAX_EMBEDS_PER_PAYLOAD: 10,
};

const truncate = (txt: string, max: number, TRUNCATED_SUFFIX: string): string =>
  txt.length > max
    ? txt.slice(0, max - TRUNCATED_SUFFIX.length) + TRUNCATED_SUFFIX
    : txt;

/**
 * Split an arbitrarily long string into chunks <= given `size`.
 */
const chunk = (txt: string, size: number): string[] => {
  if (!txt) return [];
  const chunks: string[] = [];
  for (let i = 0; i < txt.length; i += size) {
    chunks.push(txt.slice(i, i + size));
  }
  return chunks;
};

/**
 * Turn an `AlertInput` into the minimal list of `Embed`s that keep the entire payload
 * while fully respecting Discord size constraints.
 *
 * Every produced embed will contain an additional field `{ name: 'alertId', value }`.
 */
export function alertToEmbeds(
  alert: AlertInput,
  TRUNCATED_SUFFIX: string,
): Array<EmbedWithCharCount> {
  const alertId = randomUUID();

  // 0️⃣   Prepare / sanitise all segments ------------------------------------
  const prepared = {
    title: alert.title
      ? truncate(alert.title, DISCORD_LIMITS.TITLE, TRUNCATED_SUFFIX)
      : undefined,
    footer: alert.footer
      ? truncate(alert.footer, DISCORD_LIMITS.FOOTER, TRUNCATED_SUFFIX)
      : undefined,
    // description may be split, never truncated
    descriptionChunks: chunk(
      alert.description ?? '',
      DISCORD_LIMITS.DESCRIPTION,
    ),
    fields: ((): Embed['fields'] => {
      if (!alert.context) return [];
      return Object.entries(alert.context).map(([k, v]) => ({
        name: truncate(k, DISCORD_LIMITS.FIELD_NAME, TRUNCATED_SUFFIX),
        value: truncate(
          stringify(v),
          DISCORD_LIMITS.FIELD_VALUE,
          TRUNCATED_SUFFIX,
        ),
      }));
    })(),
  } as const;

  // 1️⃣   Convert the prepared parts into a linear list of _segments_ ---------
  type Segment =
    | { kind: 'title'; content: string }
    | { kind: 'description'; content: string }
    | { kind: 'footer'; content: string }
    | { kind: 'field'; content: Embed['fields'][number] };

  const segments: Segment[] = [];
  if (prepared.title) segments.push({ kind: 'title', content: prepared.title });
  prepared.descriptionChunks.forEach(d =>
    segments.push({ kind: 'description', content: d }),
  );
  prepared.fields.forEach(f => segments.push({ kind: 'field', content: f }));
  if (prepared.footer)
    segments.push({ kind: 'footer', content: prepared.footer });

  // 2️⃣   Greedy packing into embeds -----------------------------------------
  const embeds: EmbedWithCharCount[] = [];
  let current: Embed | null = null;
  let charCount = 0;
  let fieldCount = 0;

  const startNewEmbed = () => {
    current = {
      color: getColorForLevel(alert.level),
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: 'alertId',
          value: alertId,
        },
      ],
    } as Embed;
    charCount = 'alertId'.length + alertId.length;
    fieldCount = 1;
  };

  const commitEmbed = () => {
    if (current) {
      embeds.push({ ...(current as Embed), charsCount: charCount });
    }
    current = null;
    charCount = 0;
    fieldCount = 0;
  };

  // Greedy‑fit every segment, starting a new embed whenever we would overflow
  for (const seg of segments) {
    const ensure = () => {
      if (!current) startNewEmbed();
    };

    switch (seg.kind) {
      case 'title': {
        ensure();
        const len = seg.content.length;
        if (
          current!.title ||
          charCount + len > DISCORD_LIMITS.EMBED_TOTAL_CHARS
        ) {
          commitEmbed();
          startNewEmbed();
        }
        current!.title = seg.content;
        charCount += len;
        break;
      }
      case 'description': {
        ensure();
        const len = seg.content.length;
        if (
          current!.description ||
          charCount + len > DISCORD_LIMITS.EMBED_TOTAL_CHARS
        ) {
          commitEmbed();
          startNewEmbed();
        }
        current!.description = seg.content;
        charCount += len;
        break;
      }
      case 'footer': {
        ensure();
        const len = seg.content.length;
        if (
          current!.footer ||
          charCount + len > DISCORD_LIMITS.EMBED_TOTAL_CHARS
        ) {
          commitEmbed();
          startNewEmbed();
        }
        current!.footer = { text: seg.content };
        charCount += len;
        break;
      }
      case 'field': {
        const extraChars = seg.content.name.length + seg.content.value.length;
        if (
          !current ||
          fieldCount >= DISCORD_LIMITS.EMBED_MAX_FIELDS ||
          charCount + extraChars > DISCORD_LIMITS.EMBED_TOTAL_CHARS
        ) {
          commitEmbed();
          startNewEmbed();
        }
        current!.fields!.push(seg.content);
        fieldCount += 1;
        charCount += extraChars;
        break;
      }
    }
  }

  // Push the unfinished embed (if any)
  commitEmbed();

  return embeds;
}

export const fillBatch = (
  source: EmbedWithCharCount[],
  batchSize = DISCORD_LIMITS.MAX_EMBEDS_PER_PAYLOAD,
): Embed[] => {
  if (source.length === 0) return [];

  const batch: Embed[] = [];
  let accumulatedChars = 0;
  for (const e of source) {
    if (batch.length >= batchSize) break;
    const { charsCount, ...embed } = e;
    accumulatedChars += charsCount;
    if (accumulatedChars > DISCORD_LIMITS.EMBED_TOTAL_CHARS) {
      break;
    }

    batch.push(embed);
  }

  return batch;
};
