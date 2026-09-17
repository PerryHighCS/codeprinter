import type { FlapLayout, PageGeometry } from '../types/layout';

export type DuplexMode = 'long-edge' | 'short-edge';

/**
 * Maps a front-side flap position to where it must be drawn on the back
 * page so it lines up when the sheet is duplex-printed and the flap is cut.
 *
 * The mirror axis follows the selected physical binding edge. On portrait
 * pages, long-edge binding mirrors horizontally and short-edge binding
 * mirrors vertically; landscape pages swap those axes because their long
 * edge is horizontal. Calibration remains useful for printer registration,
 * but the base transform must preserve page orientation first.
 */
export function transformFlapForDuplex(
    flap: FlapLayout,
    geometry: PageGeometry,
    mode: DuplexMode,
): FlapLayout {
    const isLandscape = geometry.width > geometry.height;
    const mirrorsHorizontally = mode === 'long-edge' ? !isLandscape : isLandscape;

    if (mirrorsHorizontally) {
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
