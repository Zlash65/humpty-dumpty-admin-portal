'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import type { SearchableSelectOption } from '@/components/ui/SearchableSelect';
import useDebouncedValue from '@/components/ui/search/useDebouncedValue';

export type AsyncSearchableSelectProps = {
    id?: string;
    name?: string;
    label: string;
    placeholder?: string;
    value: string;
    onChange: (nextValue: string) => void | Promise<void>;
    disabled?: boolean;
    required?: boolean;
    fullWidth?: boolean;
    size?: 'small' | 'medium';
    helperText?: React.ReactNode;
    error?: boolean;
    disableClearable?: boolean;
    minSearchChars?: number;
    debounceMs?: number;
    listboxMaxHeight?: number;
    textFieldProps?: Omit<TextFieldProps, 'label' | 'placeholder' | 'required' | 'error' | 'helperText'>;
    /**
     * Used when you need a stable label for an existing value (e.g. edit mode)
     * without an extra fetch.
     */
    valueOption?: SearchableSelectOption | null;
    fetchOptions: (query: string) => Promise<SearchableSelectOption[]>;
};

export default function AsyncSearchableSelect({
    id,
    name,
    label,
    placeholder,
    value,
    onChange,
    disabled = false,
    required = false,
    fullWidth = true,
    size = 'small',
    helperText,
    error,
    disableClearable,
    minSearchChars = 2,
    debounceMs = 300,
    listboxMaxHeight = 360,
    textFieldProps,
    valueOption = null,
    fetchOptions,
}: AsyncSearchableSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState('');
    const debouncedInput = useDebouncedValue(inputValue, debounceMs);

    const [options, setOptions] = React.useState<SearchableSelectOption[]>([]);
    const [loading, setLoading] = React.useState(false);

    const selectedOption = React.useMemo(() => {
        if (!value) return null;
        if (valueOption && String(valueOption.value) === String(value)) return valueOption;
        return options.find((o) => String(o.value) === String(value)) ?? null;
    }, [options, value, valueOption]);

    React.useEffect(() => {
        if (!open) return;
        if (disabled) return;

        const q = String(debouncedInput || '').trim();
        if (minSearchChars > 0 && q.length < minSearchChars) {
            setOptions(selectedOption ? [selectedOption] : []);
            setLoading(false);
            return;
        }

        let active = true;
        setLoading(true);
        (async () => {
            try {
                const next = await fetchOptions(q);
                if (!active) return;

                const merged = (() => {
                    if (!selectedOption) return next;
                    if (next.some((o) => String(o.value) === String(selectedOption.value))) return next;
                    return [selectedOption, ...next];
                })();

                setOptions(merged);
            } catch {
                if (!active) return;
                setOptions(selectedOption ? [selectedOption] : []);
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [open, disabled, debouncedInput, minSearchChars, fetchOptions, selectedOption]);

    const noOptionsText =
        minSearchChars > 0 && String(inputValue || '').trim().length < minSearchChars
            ? `Type at least ${minSearchChars} character${minSearchChars === 1 ? '' : 's'} to search`
            : 'No matches';

    return (
        <>
            {name && <input type="hidden" name={name} value={value || ''} />}
            <Autocomplete
                id={id}
                size={size}
                fullWidth={fullWidth}
                disabled={disabled}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                options={options}
                value={selectedOption}
                loading={loading}
                filterOptions={(x) => x}
                isOptionEqualToValue={(a, b) => String(a.value) === String(b.value)}
                getOptionLabel={(o) => o?.label || ''}
                onChange={(_e, next) => {
                    void onChange(next?.value || '');
                }}
                inputValue={inputValue}
                onInputChange={(_e, next) => setInputValue(next)}
                noOptionsText={noOptionsText}
                loadingText="Loading…"
                disableClearable={disableClearable ?? required}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        {...textFieldProps}
                        label={label}
                        placeholder={placeholder}
                        required={required}
                        error={error}
                        helperText={helperText}
                        slotProps={{
                            ...textFieldProps?.slotProps,
                            input: {
                                ...params.InputProps,
                                endAdornment: (
                                    <>
                                        {loading ? <CircularProgress color="inherit" size={18} /> : null}
                                        {params.InputProps.endAdornment}
                                    </>
                                ),
                            },
                        }}
                        inputProps={{
                            ...params.inputProps,
                            title: selectedOption?.label || '',
                        }}
                    />
                )}
                slotProps={{
                    listbox: {
                        style: { maxHeight: listboxMaxHeight, overflow: 'auto' },
                    },
                }}
            />
        </>
    );
}
