'use client';

import { Paper } from '@mui/material';
import type { PaperProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import type { DataGridProps, GridValidRowModel } from '@mui/x-data-grid';

type PaperSx = PaperProps['sx'];

const basePaperSx: PaperSx = {
    p: { xs: 0.5, sm: 1 },
    width: '100%',
    maxWidth: '100%',
    overflow: 'auto',
    position: 'relative',
};

const baseGridSx: SxProps<Theme> = {
    border: 0,
    minWidth: '100%',
    '& .MuiDataGrid-cell': {
        fontSize: { xs: '0.75rem', sm: '0.875rem' },
    },
    '& .MuiDataGrid-columnHeader': {
        fontSize: { xs: '0.75rem', sm: '0.875rem' },
    },
};

function stickyActionsSx(actionsField: string): SxProps<Theme> {
    const cellSelector = `& .MuiDataGrid-cell[data-field="${actionsField}"]`;
    const headerSelector = `& .MuiDataGrid-columnHeader[data-field="${actionsField}"]`;
    return {
        // Sticky Actions Column (CSS-based for FREE version)
        [cellSelector]: {
            position: 'sticky !important',
            right: 0,
            backgroundColor: '#fff !important',
            zIndex: 1,
            borderLeft: '2px solid #e0e0e0',
            boxShadow: '-4px 0 8px rgba(0,0,0,0.08)',
            transform: 'translate3d(0, 0, 0)',
            willChange: 'auto',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            perspective: 1000,
            WebkitPerspective: 1000,
            isolation: 'isolate',
        },
        [headerSelector]: {
            position: 'sticky !important',
            right: 0,
            backgroundColor: '#f5f5f5 !important',
            zIndex: 3,
            borderLeft: '2px solid #e0e0e0',
            boxShadow: '-4px 0 8px rgba(0,0,0,0.08)',
            transform: 'translate3d(0, 0, 0)',
            willChange: 'auto',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            perspective: 1000,
            WebkitPerspective: 1000,
            isolation: 'isolate',
        },
        // Ensure filler cells also stick
        '& .MuiDataGrid-filler--pinnedRight': {
            position: 'sticky !important',
            right: 0,
            backgroundColor: '#f5f5f5',
            zIndex: 2,
        },
        // Additional anti-flashing for scrollable area
        '& .MuiDataGrid-virtualScrollerRenderZone': {
            transform: 'translate3d(0, 0, 0)',
        },
    };
}

export type StandardDataGridProps<R extends GridValidRowModel = any> = DataGridProps<R> & {
    paperSx?: PaperSx;
    paperProps?: Omit<PaperProps, 'children' | 'sx'>;
    stickyActionsField?: string | null;
};

function mergePaperSx(base: PaperSx, extra?: PaperSx): PaperSx {
    if (!extra) return base;

    return (theme: Theme) => {
        const baseObj = typeof base === 'function' ? base(theme) : base;
        const extraObj = typeof extra === 'function' ? extra(theme) : extra;
        return { ...(baseObj as object), ...(extraObj as object) };
    };
}

export default function StandardDataGrid<R extends GridValidRowModel = any>({
    paperSx,
    paperProps,
    stickyActionsField = '__actions',
    disableVirtualization,
    disableRowSelectionOnClick,
    sx,
    ...gridProps
}: StandardDataGridProps<R>) {
    const stickySx = stickyActionsField ? stickyActionsSx(stickyActionsField) : undefined;
    const sxArray = Array.isArray(sx) ? sx : sx ? [sx] : [];

    return (
        <Paper sx={mergePaperSx(basePaperSx, paperSx)} {...paperProps}>
            <DataGrid
                {...gridProps}
                disableVirtualization={disableVirtualization ?? true}
                disableRowSelectionOnClick={disableRowSelectionOnClick ?? true}
                sx={[baseGridSx, stickySx, ...sxArray]}
            />
        </Paper>
    );
}
