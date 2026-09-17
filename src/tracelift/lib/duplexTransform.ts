import type { FlapLayout, PageGeometry } from '../types/layout';

export type DuplexMode = 'long-edge' | 'short-edge';

/**
 * Maps a front-side flap position to where it must be drawn on the back
 * page so it lines up when the sheet is duplex-printed and the flap is cut.
 *
 * long-edge binding (flip like a book, along the paper's long edge) mirrors
 * horizontally; short-edge binding (flip like a legal pad, along the short
 * edge) mirrors vertically. This is a starting assumption, not a verified
 * fact about any particular printer — see the plan's calibration page notes
 * (section 15) and the caveat in section 14.
 */
export function transformFlapForDuplex(
    flap: FlapLayout,
    geometry: PageGeometry,
    mode: DuplexMode,
): FlapLayout {
    if (mode === 'long-edge') {
        return { ...flap, x: geometry.width - flap.x - flap.width };
    }

    return { ...flap, y: geometry.height - flap.y - flap.height };
}

export function transformFlapsForDuplex(
    flaps: FlapLayout[],
    geometry: PageGeometry,
    mode: DuplexMode,
): FlapLayout[] {
    return flaps.map((flap) => transformFlapForDuplex(flap, geometry, mode));
}
