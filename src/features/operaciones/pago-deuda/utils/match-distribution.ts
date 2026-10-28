export interface MatchBalance {
    id: number;
    monto_deposito_cliente?: number | null;
    monto_devuelto?: number | null;
}

const cents = (value: number | null | undefined) => Math.round(Number(value ?? 0) * 100);

export const getMatchDistribution = (amount: number | null | undefined, candidates: MatchBalance[], ids: number[]) => {
    const unique = new Set(ids);
    const selected = candidates.filter((row) => unique.has(row.id));
    const balances = selected.map((row) => cents(row.monto_deposito_cliente) - cents(row.monto_devuelto));
    const total = balances.reduce((sum, value) => sum + value, 0);
    const source = cents(amount);
    const valid = source > 0 && Number.isFinite(source) && unique.size === ids.length && selected.length === ids.length
        && selected.length > 0 && balances.every((value) => Number.isFinite(value) && value > 0)
        && (selected.length === 1 ? total >= source : total === source);
    return { total: total / 100, difference: (source - total) / 100, valid, count: selected.length };
};
