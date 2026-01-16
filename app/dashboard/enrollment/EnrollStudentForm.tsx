'use client';

import { enrollStudent } from '@/app/actions/enrollment';
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Box, Button, TextField, Alert, Grid } from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import AsyncSearchableSelect from '@/components/ui/AsyncSearchableSelect';
import { divisionsFromCount } from '@/lib/divisions';

interface ClassEntry {
    _id: string;
    class: string;
    shiftName?: string;
    numDivisions?: number;
}

interface EnrollStudentFormProps {
    academicYearId: string;
    branchId?: string | null;
    classEntries?: ClassEntry[];
    onEnrolled?: () => void;
}

export default function EnrollStudentForm({
    academicYearId,
    branchId = null,
    classEntries = [],
    onEnrolled
}: EnrollStudentFormProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<AlertColor>('info');
    const [studentId, setStudentId] = useState('');
    const [feeStructureId, setFeeStructureId] = useState('');
    const [division, setDivision] = useState('');

    const classOptions = useMemo<SearchableSelectOption[]>(() => {
        return (classEntries || [])
            .map((c) => {
                const shift = c.shiftName ? ` \u2022 ${c.shiftName}` : '';
                const label = `${c.class || ''}${shift}`.trim();
                return {
                    value: String(c._id),
                    label,
                    keywords: `${c.class || ''} ${c.shiftName || ''}`.trim(),
                };
            })
            .filter((o) => Boolean(o.label));
    }, [classEntries]);

    const selectedClassEntry = useMemo(() => {
        return (classEntries || []).find((c) => String(c._id) === String(feeStructureId)) || null;
    }, [classEntries, feeStructureId]);

    const divisionOptions = useMemo<SearchableSelectOption[]>(() => {
        if (!selectedClassEntry) return [];
        return divisionsFromCount(selectedClassEntry.numDivisions || 1).map((d) => ({ value: d, label: d }));
    }, [selectedClassEntry]);

    const fetchStudentOptions = useCallback(
        async (q: string) => {
            try {
                const params = new URLSearchParams();
                params.set('q', q);
                params.set('limit', '30');
                if (branchId) params.set('branchId', String(branchId));
                if (academicYearId) params.set('excludeAcademicYearId', String(academicYearId));
                const res = await fetch(`/api/students/search?${params.toString()}`, { credentials: 'include' });
                if (!res.ok) {
                    console.error('Student search API error:', res.status, res.statusText);
                    return [];
                }
                const json = (await res.json()) as { options?: Array<{ value: string; label: string; keywords?: string }> };
                return json?.options || [];
            } catch (err) {
                console.error('Student search fetch error:', err);
                return [];
            }
        },
        [branchId, academicYearId]
    );

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        if (!studentId) {
            e.preventDefault();
            setMessage('Please select a student.');
            setSeverity('error');
            return;
        }
        if (!feeStructureId) {
            e.preventDefault();
            setMessage('Please select a class.');
            setSeverity('error');
            return;
        }
        if (!division) {
            e.preventDefault();
            setMessage('Please select a division.');
            setSeverity('error');
            return;
        }
    };

    async function action(formData: FormData) {
        formData.set('academicYearId', academicYearId);
        const res = await enrollStudent(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Student enrolled successfully!');
            setSeverity('success');
            formRef.current?.reset();
            setStudentId('');
            setDivision('');
            onEnrolled?.();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} onSubmit={handleSubmit} sx={{ mt: 1 }}>
            {classOptions.length === 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    No classes found for this Academic Year / Branch. Please create Classes (Fee Structures) first.
                </Alert>
            )}
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <AsyncSearchableSelect
                        id="enrollment-student"
                        name="studentId"
                        label="Student"
                        required
                        value={studentId}
                        onChange={setStudentId}
                        fetchOptions={fetchStudentOptions}
                        placeholder="Type to search (name / admission no)"
                        listboxMaxHeight={360}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <SearchableSelect
                        id="enrollment-class"
                        name="feeStructureId"
                        label="Class"
                        placeholder={classOptions.length ? 'Select class' : 'No classes available'}
                        value={feeStructureId}
                        onChange={(next) => {
                            setFeeStructureId(next);
                            const entry = (classEntries || []).find((c) => String(c._id) === String(next)) || null;
                            const nextDivision = divisionsFromCount(entry?.numDivisions || 1)[0] || 'A';
                            setDivision(nextDivision);
                        }}
                        options={classOptions}
                        required
                        disableClearable
                        listboxMaxHeight={360}
                        disabled={classOptions.length === 0}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <SearchableSelect
                        id="enrollment-division"
                        name="division"
                        label="Division"
                        placeholder="Select"
                        value={division}
                        onChange={(next) => setDivision(next)}
                        options={divisionOptions}
                        required
                        disabled={!feeStructureId || divisionOptions.length === 0}
                        disableClearable
                        listboxMaxHeight={240}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField id="enrollment-roll-number" name="rollNumber" label="Roll No" fullWidth />
                </Grid>
                <Grid size={{ xs: 12 }}>
                    <Button type="submit" variant="contained" size="large" disabled={classOptions.length === 0}>
                        Enroll
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
