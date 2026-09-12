import en from '../locales/en.json' with { type: 'json' };
import es from '../locales/es.json' with { type: 'json' };

export const dictionaries = { en, es };
export type LocaleKey = keyof typeof dictionaries;
export { en, es };
