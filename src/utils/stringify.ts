/**
 * Function to replace BigInt with string when using JSON.stringify
 *
 * @param key - The key of the property being serialized.
 * @param value - The value of the property being serialized.
 * @return The serialized value.
 */
export const replacer = (_key: unknown, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // in case we receive an error, we want tp get its contents
  if (value instanceof Error) {
    return value.stack ?? value.toString();
  }

  return value;
};

export const stringify = (input: unknown) => {
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.stack ?? input.toString();

  return JSON.stringify(input, replacer);
};
