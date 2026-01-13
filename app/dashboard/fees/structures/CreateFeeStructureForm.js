'use client';

import { createFeeStructure } from '@/app/actions/feeStructure';
import { useRef, useState } from 'react';
import { Box, Button, TextField, Alert, Grid, MenuItem, Typography } from '@mui/material';

export default function CreateFeeStructureForm({ years, branches = [], defaultYearId, defaultBranchId }) {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');

    async function action(formData) {
        const res = await createFeeStructure(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Fee Structure saved successfully!');
            setSeverity('success');
            formRef.current?.reset();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                    <TextField
                        select
                        name="academicYearId"
                        label="Academic Year"
                        fullWidth
                        required
                        defaultValue={defaultYearId || ''}
                    >
                        <MenuItem value="">Select Year</MenuItem>
                        {years.map(y => (
                            <MenuItem key={y._id} value={y._id}>{y.name}</MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        select
                        name="branchId"
                        label="Branch"
                        fullWidth
                        required
                        defaultValue={defaultBranchId || ''}
                    >
                        <MenuItem value="">Select Branch</MenuItem>
                        {branches.map(b => (
                            <MenuItem key={b._id} value={b._id}>{b.name}</MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField name="class" label="Class" placeholder="e.g. Grade 5" fullWidth required />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField name="shiftName" label="Shift (Optional)" placeholder="e.g. Morning" fullWidth />
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>Fee Components</Typography>
                </Grid>

                <Grid item xs={12} sm={4}>
                    <TextField name="term1" label="Term 1" type="number" inputProps={{ min: 0, step: 0.01 }} fullWidth defaultValue="0" />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="term2" label="Term 2" type="number" inputProps={{ min: 0, step: 0.01 }} fullWidth defaultValue="0" />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="bookFee" label="Book Fee" type="number" inputProps={{ min: 0, step: 0.01 }} fullWidth defaultValue="0" />
                </Grid>

                <Grid item xs={12}>
                    <Button type="submit" variant="contained" size="large">
                        Save Fees
                    </Button>
                </Grid>
            </Grid>

            {message && (
                <Alert severity={severity} sx={{ mt: 2 }}>
                    {message}
                </Alert>
            )}
        </Box>
    );
}
