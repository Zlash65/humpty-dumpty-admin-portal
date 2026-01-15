'use client';

import { DataGrid } from '@mui/x-data-grid';
import type { DataGridProps, GridValidRowModel } from '@mui/x-data-grid';
import type { SxProps, Theme } from '@mui/material/styles';

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

export default function BareDataGrid<R extends GridValidRowModel = any>({
    sx,
    disableRowSelectionOnClick,
    ...gridProps
}: DataGridProps<R>) {
    const sxArray = Array.isArray(sx) ? sx : sx ? [sx] : [];

    return (
        <DataGrid
            {...gridProps}
            disableRowSelectionOnClick={disableRowSelectionOnClick ?? true}
            sx={[baseGridSx, ...sxArray]}
        />
    );
}

