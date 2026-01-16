/**
 * Division helpers.
 *
 * Domain:
 * - "Division" is the domain term (DB column: division).
 * - Divisions are lettered A.. based on a class's division count.
 */

export function divisionsFromCount(numDivisions: number | null | undefined): string[] {
    const nRaw = Number(numDivisions);
    const n = Number.isFinite(nRaw) ? Math.max(1, Math.floor(nRaw)) : 1;

    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
        // A..Z then AA.. if ever needed.
        const label = (() => {
            if (i < 26) return String.fromCharCode(65 + i);
            const first = String.fromCharCode(65 + Math.floor(i / 26) - 1);
            const second = String.fromCharCode(65 + (i % 26));
            return `${first}${second}`;
        })();
        out.push(label);
    }

    return out;
}
