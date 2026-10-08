import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { prettifySource } from '../lib/prettify';
import { TAB_WIDTHS } from '../lib/persistedState';

interface WorksheetEditorProps {
    source: string;
    onChange: (source: string) => void;
    tabWidth: number;
    onTabWidthChange: (tabWidth: number) => void;
}

export function WorksheetEditor({ source, onChange, tabWidth, onTabWidthChange }: WorksheetEditorProps) {
    const [prettifyError, setPrettifyError] = useState<string | null>(null);
    const [isPrettifying, setIsPrettifying] = useState(false);

    async function handlePrettify() {
        setIsPrettifying(true);
        try {
            const formatted = await prettifySource(source, tabWidth);
            onChange(formatted);
            setPrettifyError(null);
        } catch (error) {
            setPrettifyError(error instanceof Error ? error.message : 'Could not format this code.');
        } finally {
            setIsPrettifying(false);
        }
    }

    return (
        <div className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between">
                <label htmlFor="tracelift-source" className="text-muted-foreground text-sm font-medium">
                    Source
                </label>
                <div className="flex items-center gap-2">
                    <label className="text-muted-foreground flex items-center gap-1 text-sm">
                        Tab width
                        <select
                            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                            value={tabWidth}
                            onChange={(event) => onTabWidthChange(Number(event.target.value))}
                        >
                            {TAB_WIDTHS.map((width) => (
                                <option key={width} value={width}>
                                    {width}
                                </option>
                            ))}
                        </select>
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={handlePrettify} disabled={isPrettifying}>
                        Prettify
                    </Button>
                </div>
            </div>
            <Textarea
                id="tracelift-source"
                className="min-h-[300px] flex-1 resize-none font-mono text-sm"
                style={{ tabSize: tabWidth }}
                value={source}
                onChange={(event) => onChange(event.target.value)}
                disabled={isPrettifying}
                spellCheck={false}
            />
            {prettifyError && (
                <p role="alert" className="text-destructive text-sm">
                    Could not prettify: {prettifyError}
                </p>
            )}
        </div>
    );
}
