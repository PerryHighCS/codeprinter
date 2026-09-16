import type { PageSettings } from '../types/settings';
import type { DuplexMode } from './duplexTransform';

export type DuplexPreferences = Record<string, DuplexMode>;

/**
 * Duplex registration is a property of the physical paper size and
 * orientation, not of any particular worksheet's content, so preferences
 * are keyed by page configuration (e.g. "letter-portrait") and shared
 * across every worksheet printed at that configuration.
 */
export function pageConfigKey(settings: Pick<PageSettings, 'paperSize' | 'orientation'>): string {
    return `${settings.paperSize}-${settings.orientation}`;
}

const DEFAULT_DUPLEX_MODE: DuplexMode = 'long-edge';

export function getDuplexMode(
    preferences: DuplexPreferences,
    settings: Pick<PageSettings, 'paperSize' | 'orientation'>,
): DuplexMode {
    return preferences[pageConfigKey(settings)] ?? DEFAULT_DUPLEX_MODE;
}

export function withDuplexMode(
    preferences: DuplexPreferences,
    settings: Pick<PageSettings, 'paperSize' | 'orientation'>,
    mode: DuplexMode,
): DuplexPreferences {
    return { ...preferences, [pageConfigKey(settings)]: mode };
}
