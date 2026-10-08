export type PaperSize = 'letter' | 'legal' | 'tabloid';

export type Orientation = 'portrait' | 'landscape';

export interface PageSettings {
    paperSize: PaperSize;
    orientation: Orientation;
    marginIn: number;
    fontSizePt: number;
    lineSpacing: number;
}
