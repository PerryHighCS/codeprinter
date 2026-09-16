import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { WorksheetLayout } from '../types/layout';
import type { DuplexMode } from '../lib/duplexTransform';
import { FrontPage } from './FrontPage';
import { BackPage } from './BackPage';
import { RESPONSIVE_SVG_CLASS } from './responsiveSvgClass';

type PreviewMode = 'front' | 'back' | 'side-by-side';

const PREVIEW_MODES: { value: PreviewMode; label: string }[] = [
    { value: 'front', label: 'Front' },
    { value: 'back', label: 'Back' },
    { value: 'side-by-side', label: 'Side by Side' },
];

interface PreviewPanelProps {
    layout: WorksheetLayout;
    duplexMode: DuplexMode;
}

export function PreviewPanel({ layout, duplexMode }: PreviewPanelProps) {
    const [mode, setMode] = useState<PreviewMode>('side-by-side');

    return (
        <div id="tracelift-preview" className="flex h-full flex-col gap-2">
            <div className="flex gap-2">
                {PREVIEW_MODES.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={cn(
                            'rounded-md border px-3 py-1 text-sm',
                            mode === option.value
                                ? 'bg-accent text-accent-foreground'
                                : 'bg-background text-foreground',
                        )}
                        onClick={() => setMode(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div
                className={cn(
                    'flex flex-1 gap-4 overflow-auto',
                    mode === 'side-by-side' ? 'flex-row' : 'flex-col',
                )}
            >
                {(mode === 'front' || mode === 'side-by-side') && (
                    <div className={RESPONSIVE_SVG_CLASS}>
                        <FrontPage layout={layout} />
                    </div>
                )}
                {(mode === 'back' || mode === 'side-by-side') && (
                    <div className={RESPONSIVE_SVG_CLASS}>
                        <BackPage layout={layout} duplexMode={duplexMode} />
                    </div>
                )}
            </div>
        </div>
    );
}
