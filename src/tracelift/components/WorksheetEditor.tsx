import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { prettifySource } from '../lib/prettify';

interface WorksheetEditorProps {
    source: string;
    onChange: (source: string) => void;
}

export function WorksheetEditor({ source, onChange }: WorksheetEditorProps) {
    const [prettifyError, setPrettifyError] = useState<string | null>(null);
    const [isPrettifying, setIsPrettifying] = useState(false);

    async function handlePrettify() {
        setIsPrettifying(true);
        try {
            const formatted = await prettifySource(source);
            onChange(formatted);
            setPrettifyError(null);
        } catch (error) {
            setPrettifyError(error instanceof Error ? error.message : 'Could not format this code.');
        } finally {
            setIsPrettifying(false);
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between">
                <label htmlFor="tracelift-source" className="text-muted-foreground text-sm font-medium">
                    Source
                </label>
                <Button type="button" variant="outline" size="sm" onClick={handlePrettify} disabled={isPrettifying}>
                    Prettify
                </Button>
            </div>
            <Textarea
                id="tracelift-source"
                className="min-h-[300px] flex-1 resize-none font-mono text-sm"
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
