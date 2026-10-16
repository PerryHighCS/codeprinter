import type { EvaluationWindowLayout } from '../types/layout';
import { UNITS_PER_INCH } from './pageGeometry';

export const EVALUATION_MIN_WIDTH = UNITS_PER_INCH;
export const EVALUATION_HEIGHT = 0.55 * UNITS_PER_INCH;
export const EVALUATION_PADDING = 0.1 * UNITS_PER_INCH;
export const MIN_PAPER_BRIDGE = 0.15 * UNITS_PER_INCH;
export const EVALUATION_CORNER_RADIUS = 0.04 * UNITS_PER_INCH;

export function evaluationCutPath(window: EvaluationWindowLayout): string {
    const { x, y, width, height } = window;
    const r = EVALUATION_CORNER_RADIUS;
    return `M ${x + r} ${y} H ${x + width - r} Q ${x + width} ${y} ${x + width} ${y + r} V ${y + height - r} Q ${x + width} ${y + height} ${x + width - r} ${y + height} H ${x + r} Q ${x} ${y + height} ${x} ${y + height - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}
