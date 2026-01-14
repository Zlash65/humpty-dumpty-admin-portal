/**
 * Export data to CSV file
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Name of the file (without extension)
 * @param {Array} columns - Column definitions [{key: 'field', label: 'Display Name'}]
 */
export function exportToCSV(data, filename, columns) {
    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    // Create header row
    const headers = columns.map(col => `"${col.label}"`).join(',');

    // Create data rows
    const rows = data.map(item => {
        return columns.map(col => {
            let value = item[col.key];

            // Handle nested properties like studentId.firstName
            if (col.key.includes('.')) {
                const keys = col.key.split('.');
                value = keys.reduce((obj, key) => obj?.[key], item);
            }

            // Format value
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            }

            // Escape quotes and wrap in quotes
            value = String(value).replace(/"/g, '""');
            return `"${value}"`;
        }).join(',');
    });

    // Combine header and rows
    const csv = [headers, ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

/**
 * Format currency for export
 */
export function formatCurrencyForExport(amount) {
    return amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '₹0';
}

/**
 * Format date for export
 */
export function formatDateForExport(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}
