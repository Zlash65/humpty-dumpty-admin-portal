'use client';

import * as React from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Checkbox from '@mui/material/Checkbox';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import type { SearchableSelectOption } from '@/components/ui/SearchableSelect';

export type MultiSearchableSelectProps = {
    id?: string;
    /**
     * If provided, the component will include a hidden input so the selection
     * participates in native form submission / FormData.
     *
     * Value is stored as JSON array (string[]).
     */
    name?: string;
    label: string;
    placeholder?: string;
    value: string[];
    onChange: (nextValues: string[]) => void | Promise<void>;
    options: readonly SearchableSelectOption[];
    fullWidth?: boolean;
    disabled?: boolean;
    /**
     * Multi selects are typically optional. If set to true, empty selection is invalid.
     */
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
    noOptionsText?: React.ReactNode;
    /**
     * Show checkboxes in the dropdown list for clarity.
     */
    showCheckboxes?: boolean;
    /**
     * Keep the menu open while selecting multiple items.
     */
    disableCloseOnSelect?: boolean;
    /**
     * The maximum number of tags that will be visible when not focused.
     * Set `-1` to disable the limit.
     */
    limitTags?: number;
    /**
     * Text to show when tags are truncated by `limitTags`.
     */
    getLimitTagsText?: (more: number) => React.ReactNode;
    textFieldProps?: Omit<TextFieldProps, 'label' | 'placeholder' | 'required' | 'error' | 'helperText'>;
};

const uncheckedIcon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

export default function MultiSearchableSelect({
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
    noOptionsText,
    showCheckboxes = true,
    disableCloseOnSelect = true,
    limitTags,
    getLimitTagsText,
    textFieldProps,
}: MultiSearchableSelectProps) {
    const selectedOptions = React.useMemo(() => {
        if (!Array.isArray(value) || value.length === 0) return [];
        const wanted = new Set(value.map((v) => String(v)));
        return options.filter((o) => wanted.has(String(o.value)));
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

    const hasError = Boolean(error) || (required && (!value || value.length === 0));

    return (
        <>
            {name && <input type="hidden" name={name} value={JSON.stringify(value || [])} />}
            <Autocomplete
                id={id}
                multiple
                size={size}
                fullWidth={fullWidth}
                disabled={disabled}
                disableCloseOnSelect={disableCloseOnSelect}
                limitTags={limitTags}
                getLimitTagsText={getLimitTagsText}
                options={options as SearchableSelectOption[]}
                value={selectedOptions}
                isOptionEqualToValue={(a, b) => String(a.value) === String(b.value)}
                getOptionLabel={(o) => o?.label || ''}
                getOptionDisabled={(o) => Boolean(o.disabled)}
                onChange={(_e, next) => {
                    void onChange((next || []).map((o) => String(o.value)));
                }}
                filterOptions={filterOptions as never}
                noOptionsText={derivedNoOptionsText}
                renderOption={(props, option, { selected }) => {
                    const { key, ...optionProps } = props;
                    return (
                        <li key={key} {...optionProps}>
                            {showCheckboxes && (
                                <Checkbox
                                    icon={uncheckedIcon}
                                    checkedIcon={checkedIcon}
                                    checked={selected}
                                    sx={{ mr: 1 }}
                                />
                            )}
                            {option.label}
                        </li>
                    );
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        {...textFieldProps}
                        label={label}
                        placeholder={placeholder}
                        required={required}
                        error={hasError}
                        helperText={helperText}
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
