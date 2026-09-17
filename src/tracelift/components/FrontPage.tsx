import type { WorksheetLayout } from '../types/layout';
import { WorksheetPage } from './WorksheetPage';
import { FlapCutGuide } from './FlapCutGuide';

interface FrontPageProps {
    layout: WorksheetLayout;
}

export function FrontPage({ layout }: FrontPageProps) {
    const { geometry, title, lines, flaps, lineNumberRuleX } = layout;

    return (
        <WorksheetPage geometry={geometry}>
            <text x={title.x} y={title.y} fontSize={title.fontSize} fontWeight="bold">
                {title.text}
            </text>

            {lines.length > 0 && (
                <line
                    x1={lineNumberRuleX}
                    y1={geometry.margin}
                    x2={lineNumberRuleX}
                    y2={geometry.margin + geometry.contentHeight}
                    stroke="#000000"
                    strokeWidth={1}
                />
            )}

            {lines.map((line) => (
                <g key={line.number}>
                    <text x={geometry.margin} y={line.baselineY} fontSize={line.fontSize}>
                        {line.number}
                    </text>

                    {line.tokens.map((layoutToken, tokenIndex) => (
                        <text
                            key={
                                layoutToken.token.type === 'flap'
                                    ? layoutToken.token.id
                                    : `${line.number}-text-${tokenIndex}`
                            }
                            x={layoutToken.x}
                            y={line.baselineY}
                            fontSize={line.fontSize}
                        >
                            {layoutToken.token.text}
                        </text>
                    ))}
                </g>
            ))}

            {flaps.map((flap) => (
                <FlapCutGuide key={flap.id} flap={flap} />
            ))}
        </WorksheetPage>
    );
}
