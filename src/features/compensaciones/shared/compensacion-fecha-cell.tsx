export const CompensacionFechaCell = ({ value, includeTime = true }: { value: unknown; includeTime?: boolean }) => {
    const text = String(value ?? "");
    // Calendar dates have no timezone: do not shift them to the preceding day in Lima.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    const date = new Date(dateOnly ? `${text}T12:00:00Z` : text);
    if (Number.isNaN(date.getTime())) return <>—</>;
    return (
        <div className="space-y-1">
            <p>{date.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
            {includeTime && !dateOnly && (
                <p className="text-xs text-tertiary">{date.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" })}</p>
            )}
        </div>
    );
};
