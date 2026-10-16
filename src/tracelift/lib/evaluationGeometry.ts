import type { EvaluationWindowLayout } from '../types/layout';
import { UNITS_PER_INCH } from './pageGeometry';

export const EVALUATION_MIN_WIDTH = UNITS_PER_INCH;
export const EVALUATION_HEIGHT = 0.55 * UNITS_PER_INCH;
export const EVALUATION_PADDING = 0.1 * UNITS_PER_INCH;
export const MIN_PAPER_BRIDGE = 0.15 * UNITS_PER_INCH;

export function evaluationCutPath(window: EvaluationWindowLayout): string {
    const { x, y, width, height } = window;
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z M ${x} ${y} L ${x + width} ${y + height} M ${x + width} ${y} L ${x} ${y + height}`;
}
