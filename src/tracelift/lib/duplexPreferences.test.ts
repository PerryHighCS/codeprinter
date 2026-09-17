import { describe, expect, it } from 'vitest';
import { getDuplexMode, pageConfigKey, withDuplexMode } from './duplexPreferences';

describe('pageConfigKey', () => {
    it('combines paper size and orientation into a stable key', () => {
        expect(pageConfigKey({ paperSize: 'letter', orientation: 'portrait' })).toBe('letter-portrait');
        expect(pageConfigKey({ paperSize: 'tabloid', orientation: 'landscape' })).toBe('tabloid-landscape');
    });
});

describe('getDuplexMode', () => {
    it('defaults to long-edge when no preference has been saved for that page config', () => {
        expect(getDuplexMode({}, { paperSize: 'letter', orientation: 'portrait' })).toBe('long-edge');
    });

    it('returns the saved preference for that specific page config', () => {
        const prefs = { 'letter-portrait': 'short-edge' as const };
        expect(getDuplexMode(prefs, { paperSize: 'letter', orientation: 'portrait' })).toBe('short-edge');
    });

    it('does not apply one page config’s preference to another', () => {
        const prefs = { 'letter-portrait': 'short-edge' as const };
        expect(getDuplexMode(prefs, { paperSize: 'letter', orientation: 'landscape' })).toBe('long-edge');
        expect(getDuplexMode(prefs, { paperSize: 'tabloid', orientation: 'portrait' })).toBe('long-edge');
    });
});

describe('withDuplexMode', () => {
    it('sets the preference for one page config without disturbing others', () => {
        const before = { 'letter-portrait': 'short-edge' as const };
        const after = withDuplexMode(before, { paperSize: 'tabloid', orientation: 'landscape' }, 'long-edge');

        expect(after).toEqual({
            'letter-portrait': 'short-edge',
            'tabloid-landscape': 'long-edge',
        });
        // The original object is untouched.
        expect(before).toEqual({ 'letter-portrait': 'short-edge' });
    });
});
