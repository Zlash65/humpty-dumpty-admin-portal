'use client';

import * as React from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField, { type TextFieldProps } from '@mui/material/TextField';

export type SearchableSelectOption = {
    value: string;
    label: string;
    /**
     * Extra terms that should be searchable but not necessarily displayed,
     * e.g. roll no, admission no, class, etc.
     */
    keywords?: string;
    disabled?: boolean;
};

export type SearchableSelectProps = {
    id?: string;
    /**
     * If provided, the component will include a hidden input so the selection
     * participates in native form submission / FormData.
     */
    name?: string;
    label: string;
    placeholder?: string;
    value: string;
    onChange: (nextValue: string) => void | Promise<void>;
    options: readonly SearchableSelectOption[];
    fullWidth?: boolean;
    disabled?: boolean;
    required?: boolean;
    /**
     * For very large option sets, you usually want to require typing before
     * showing matches so the popup doesn't take the whole screen.
     *
     * Default: 0 for <= 200 options, otherwise 2.
     */
    minSearchChars?: number;
    /**
     * Limit number of matching options shown (helps large sets without virtualization).
     *
     * Default: 200 for <= 200 options, otherwise 100.
     */
    limit?: number;
    listboxMaxHeight?: number;
    size?: 'small' | 'medium';
    helperText?: React.ReactNode;
    error?: boolean;
    disableClearable?: boolean;
    noOptionsText?: React.ReactNode;
    textFieldProps?: Omit<TextFieldProps, 'label' | 'placeholder' | 'required' | 'error' | 'helperText'>;
};

export default function SearchableSelect({
    id,
    name,
    label,
    placeholder,
    value,
    onChange,
    options,
    fullWidth = true,
    disabled = false,
    required = false,
    minSearchChars,
    limit,
    listboxMaxHeight = 320,
    size = 'small',
    helperText,
    error,
    disableClearable,
    noOptionsText,
    textFieldProps,
}: SearchableSelectProps) {
    const selectedOption = React.useMemo(() => {
        if (!value) return null;
        return options.find((o) => String(o.value) === String(value)) ?? null;
    }, [options, value]);

    const effectiveMinSearchChars = React.useMemo(() => {
        if (typeof minSearchChars === 'number') return minSearchChars;
        return options.length > 200 ? 2 : 0;
    }, [minSearchChars, options.length]);

    const effectiveLimit = React.useMemo(() => {
        if (typeof limit === 'number') return limit;
        return options.length > 200 ? 100 : 200;
    }, [limit, options.length]);

    const baseFilter = React.useMemo(() => {
        return createFilterOptions<SearchableSelectOption>({
            ignoreAccents: true,
            ignoreCase: true,
            limit: effectiveLimit,
            matchFrom: 'any',
            stringify: (option) => `${option.label} ${option.keywords || ''}`.trim(),
            trim: true,
        });
    }, [effectiveLimit]);

    const filterOptions = React.useCallback(
        (opts: readonly SearchableSelectOption[], state: { inputValue: string }) => {
            const q = (state.inputValue || '').trim();
            if (effectiveMinSearchChars > 0 && q.length < effectiveMinSearchChars) return [];
            return baseFilter(opts as SearchableSelectOption[], state as never);
        },
        [baseFilter, effectiveMinSearchChars]
    );

    const derivedNoOptionsText =
        noOptionsText ??
        (effectiveMinSearchChars > 0
            ? `Type at least ${effectiveMinSearchChars} character${effectiveMinSearchChars === 1 ? '' : 's'} to search`
            : 'No matches');

    return (
        <>
            {name && <input type="hidden" name={name} value={value || ''} />}
            <Autocomplete
                id={id}
                size={size}
                fullWidth={fullWidth}
                disabled={disabled}
                options={options as SearchableSelectOption[]}
                value={selectedOption}
                isOptionEqualToValue={(a, b) => String(a.value) === String(b.value)}
                getOptionLabel={(o) => o?.label || ''}
                getOptionDisabled={(o) => Boolean(o.disabled)}
                onChange={(_e, next) => {
                    void onChange(next?.value || '');
                }}
                filterOptions={filterOptions as never}
                noOptionsText={derivedNoOptionsText}
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
                        inputProps={{
                            ...params.inputProps,
                            title: selectedOption?.label || '',
                        }}
                    />
                )}
                slotProps={{
                    listbox: {
                        style: {
                            maxHeight: listboxMaxHeight,
                            overflow: 'auto',
                        },
                    },
                }}
            />
        </>
    );
}
