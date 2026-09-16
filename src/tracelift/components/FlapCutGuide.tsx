import type { FlapLayout } from '../types/layout';
import { flapCutPath } from '../lib/flapGeometry';

interface FlapCutGuideProps {
    flap: FlapLayout;
}

export function FlapCutGuide({ flap }: FlapCutGuideProps) {
    return (
        <path
            d={flapCutPath(flap)}
            fill="none"
            stroke="#000000"
            strokeDasharray="5 4"
            data-flap-id={flap.id}
        />
    );
}
