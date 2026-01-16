'use client';

import { useCallback, useState } from 'react';
import { Button } from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';

interface ExportAllCsvButtonProps {
    entity: string;
    filename: string;
    payload: Record<string, unknown>;
    disabled?: boolean;
    onError?: (message: string) => void;
}

function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function ExportAllCsvButton({ entity, filename, payload, disabled, onError }: ExportAllCsvButtonProps) {
    const [downloading, setDownloading] = useState(false);

    const handleClick = useCallback(async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            const res = await fetch(`/api/export/${encodeURIComponent(entity)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, filename }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => null);
                const msg = String(json?.error || `Export failed (${res.status})`);
                onError?.(msg);
                return;
            }
            const blob = await res.blob();
            downloadBlob(`${filename}.csv`, blob);
        } catch {
            onError?.('Export failed. Please try again.');
        } finally {
            setDownloading(false);
        }
    }, [downloading, entity, filename, onError, payload]);

    return (
        <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleClick}
            disabled={disabled || downloading}
        >
            {downloading ? 'Exporting…' : 'Export All'}
        </Button>
    );
}

