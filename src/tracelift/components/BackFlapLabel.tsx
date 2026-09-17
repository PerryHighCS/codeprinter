import type { FlapLayout } from '../types/layout';

interface BackFlapLabelProps {
    flap: FlapLayout;
    fontSize: number;
}

export function BackFlapLabel({ flap, fontSize }: BackFlapLabelProps) {
    const centerX = flap.x + flap.width / 2;
    const centerY = flap.y + flap.height / 2;

    return (
        <text
            x={centerX}
            y={centerY}
            fontSize={fontSize}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(180 ${centerX} ${centerY})`}
            data-flap-id={flap.id}
        >
            {flap.label}
        </text>
    );
}
