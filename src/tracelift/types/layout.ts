import type { CodeToken } from './worksheet';
import type { PageSettings } from './settings';

export interface PageGeometry {
    widthIn: number;
    heightIn: number;

    width: number;
    height: number;

    margin: number;

    contentWidth: number;
    contentHeight: number;

    lineNumberGutter: number;
}

export interface FlapLayout {
    id: string;
    label: string;

    x: number;
    y: number;

    width: number;
    height: number;
}

export interface LayoutToken {
    token: CodeToken;
    x: number;
    width: number;
}

export interface LayoutLine {
    number: number;
    baselineY: number;
    fontSize: number;
    tokens: LayoutToken[];
}

export interface TitleLayout {
    x: number;
    y: number;
    text: string;
    fontSize: number;
}

export interface OverflowInfo {
    fits: boolean;
    overflowLines: number;
}

/**
 * The subset of a laid-out page that's just "a page with some flaps on it" —
 * enough to render the back side (BackPage only ever needs geometry,
 * settings, and flaps) or drive the duplex transform, without requiring a
 * full worksheet's title/lines/overflow. The calibration page (fixed
 * flap positions, no code lines) produces this directly rather than a full
 * WorksheetLayout.
 */
export interface FlapPageData {
    geometry: PageGeometry;
    settings: PageSettings;
    flaps: FlapLayout[];
}

export interface WorksheetLayout extends FlapPageData {
    title: TitleLayout;
    lines: LayoutLine[];
    overflow: OverflowInfo;
}
