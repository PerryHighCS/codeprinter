import type { WorksheetLayout } from '../types/layout';
import { WorksheetPage } from './WorksheetPage';

interface FrontPageProps {
    layout: WorksheetLayout;
}

export function FrontPage({ layout }: FrontPageProps) {
    const { geometry, title, lines } = layout;

    return (
        <WorksheetPage geometry={geometry}>
            <text x={title.x} y={title.y} fontSize={title.fontSize} fontWeight="bold">
                {title.text}
            </text>

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
        </WorksheetPage>
    );
}
