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

export interface WorksheetLayout {
    geometry: PageGeometry;
    settings: PageSettings;
    title: TitleLayout;
    lines: LayoutLine[];
    overflow: OverflowInfo;
}
