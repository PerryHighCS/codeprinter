/**
 * Screen scaling happens on the wrapper, never the SVG's own coordinates:
 * the child <svg> keeps its physical width/height and viewBox, and this
 * class just lets it shrink responsively to fit its container. Shared by
 * any on-screen preview pane (the worksheet preview, the calibration
 * preview) that wraps a WorksheetPage-based SVG.
 *
 * object-contain (rather than w-full h-auto, which only scales by width)
 * shrinks the page to fit both the container's width AND height, so a
 * tall page doesn't overflow a short preview pane and force scrolling to
 * see the rest of it.
 */
export const RESPONSIVE_SVG_CLASS =
    'flex min-h-0 min-w-0 flex-1 items-center justify-center [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain [&>svg]:border [&>svg]:border-border';
