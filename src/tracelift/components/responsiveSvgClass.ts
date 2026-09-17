/**
 * Screen scaling happens on the wrapper, never the SVG's own coordinates:
 * the child <svg> keeps its physical width/height and viewBox, and this
 * class just lets it shrink responsively to fit its container. Shared by
 * any on-screen preview pane (the worksheet preview, the calibration
 * preview) that wraps a WorksheetPage-based SVG.
 */
export const RESPONSIVE_SVG_CLASS = 'min-w-0 flex-1 [&>svg]:h-auto [&>svg]:w-full [&>svg]:border [&>svg]:border-border';
