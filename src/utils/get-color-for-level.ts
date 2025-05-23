import type { AlertInput } from '../types';

export const getColorForLevel = (level: AlertInput['level']) => {
  if (!level) return;

  switch (level) {
    case 'fatal':
      return 0xff0000;
    case 'error':
      return 0xff6666;
    case 'warn':
      return 0xffff00;
    case 'info':
      return 0x0000ff;
    default:
      return 0x000000;
  }
};
