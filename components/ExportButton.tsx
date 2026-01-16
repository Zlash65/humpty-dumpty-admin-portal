'use client';

import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import {
    FileDownload as DownloadIcon,
    TableChart as CSVIcon,
} from '@mui/icons-material';
import { useState, MouseEvent } from 'react';
import { exportToCSV, ExportColumn } from '@/lib/export';

interface ExportButtonProps {
    data: Record<string, unknown>[];
    filename: string;
    columns: ExportColumn[];
    disabled?: boolean;
}

export default function ExportButton({ data, filename, columns, disabled = false }: ExportButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleExportCSV = () => {
        exportToCSV(data, filename, columns);
        handleClose();
    };

    return (
        <>
            <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleClick}
                disabled={disabled || !data || data.length === 0}
                sx={{
                    borderColor: '#e2e8f0',
                    color: '#64748b',
                    '&:hover': {
                        borderColor: '#4f46e5',
                        color: '#4f46e5',
                    },
                }}
            >
                Export
            </Button>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
            >
                <MenuItem onClick={handleExportCSV}>
                    <ListItemIcon>
                        <CSVIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Export as CSV</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
}
