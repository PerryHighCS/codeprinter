import { describe, expect, it } from 'vitest';
import { isValidDuplexPreferences, isValidPageSettings, isValidSource } from './persistedState';

describe('isValidSource', () => {
    it('accepts a string', () => {
        expect(isValidSource('score = 3;')).toBe(true);
    });

    it('rejects null, numbers, and objects', () => {
        expect(isValidSource(null)).toBe(false);
        expect(isValidSource(42)).toBe(false);
        expect(isValidSource({})).toBe(false);
    });
});

describe('isValidPageSettings', () => {
    const valid = {
        paperSize: 'letter',
        orientation: 'portrait',
        marginIn: 0.5,
        fontSizePt: 24,
        lineSpacing: 1.7,
    };

    it('accepts a well-formed PageSettings object', () => {
        expect(isValidPageSettings(valid)).toBe(true);
    });

    it('rejects null and non-objects', () => {
        expect(isValidPageSettings(null)).toBe(false);
        expect(isValidPageSettings('letter')).toBe(false);
    });

    it('rejects an invalid paperSize or orientation', () => {
        expect(isValidPageSettings({ ...valid, paperSize: 'a4' })).toBe(false);
        expect(isValidPageSettings({ ...valid, orientation: 'diagonal' })).toBe(false);
    });

    it('rejects a missing or non-finite numeric field', () => {
        expect(isValidPageSettings({ ...valid, fontSizePt: undefined })).toBe(false);
        expect(isValidPageSettings({ ...valid, marginIn: NaN })).toBe(false);
    });
});

describe('isValidDuplexPreferences', () => {
    it('accepts an empty object and a well-formed preferences map', () => {
        expect(isValidDuplexPreferences({})).toBe(true);
        expect(isValidDuplexPreferences({ 'letter-portrait': 'short-edge' })).toBe(true);
    });

    it('rejects null, arrays, and non-objects', () => {
        expect(isValidDuplexPreferences(null)).toBe(false);
        expect(isValidDuplexPreferences([])).toBe(false);
        expect(isValidDuplexPreferences('long-edge')).toBe(false);
    });

    it('rejects a map containing an invalid duplex mode', () => {
        expect(isValidDuplexPreferences({ 'letter-portrait': 'diagonal-edge' })).toBe(false);
    });
});
