'use client';

import { enrollStudent } from '@/app/actions/enrollment';
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Box, Button, TextField, Alert, Grid } from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import AsyncSearchableSelect from '@/components/ui/AsyncSearchableSelect';

interface AcademicYear {
    _id: string;
    name?: string;
}

interface EnrollStudentFormProps {
    years: AcademicYear[];
    defaultYearId: string | null;
    branchId?: string | null;
}

export default function EnrollStudentForm({ years, defaultYearId, branchId = null }: EnrollStudentFormProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<AlertColor>('info');
    const [academicYearId, setAcademicYearId] = useState(defaultYearId || '');
    const [studentId, setStudentId] = useState('');

    const yearOptions = useMemo<SearchableSelectOption[]>(() => {
        return (years || []).map((y) => ({
            value: y._id,
            label: y.name || '',
            keywords: y.name || '',
        }));
    }, [years]);

    const fetchStudentOptions = useCallback(
        async (q: string) => {
            const params = new URLSearchParams();
            params.set('q', q);
            params.set('limit', '30');
            if (branchId) params.set('branchId', String(branchId));
            if (academicYearId) params.set('excludeAcademicYearId', String(academicYearId));
            const res = await fetch(`/api/students/search?${params.toString()}`);
            if (!res.ok) return [];
            const json = (await res.json()) as { options?: Array<{ value: string; label: string; keywords?: string }> };
            return json?.options || [];
        },
        [branchId, academicYearId]
    );

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        if (!academicYearId) {
            e.preventDefault();
            setMessage('Please select an academic year.');
            setSeverity('error');
            return;
        }
        if (!studentId) {
            e.preventDefault();
            setMessage('Please select a student.');
            setSeverity('error');
        }
    };

    async function action(formData: FormData) {
        const res = await enrollStudent(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Student enrolled successfully!');
            setSeverity('success');
            formRef.current?.reset();
            setAcademicYearId(defaultYearId || '');
            setStudentId('');
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <SearchableSelect
                        id="enrollment-academic-year"
                        name="academicYearId"
                        label="Academic Year"
                        required
                        value={academicYearId}
                        onChange={(next) => {
                            setAcademicYearId(next);
                            setStudentId('');
                        }}
                        options={yearOptions}
                        placeholder="Select year"
                    />
                </Grid>
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
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField id="enrollment-class" name="class" label="Class" placeholder="e.g. Grade 5" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField id="enrollment-section" name="section" label="Section" placeholder="A" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField id="enrollment-roll-number" name="rollNumber" label="Roll No" fullWidth />
                </Grid>
                <Grid size={{ xs: 12 }}>
                    <Button type="submit" variant="contained" size="large">
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
