export const reconcileRows = <T extends { id: number }>(previousRows: T[], nextRows: T[]) => {
    const previousById = new Map(previousRows.map((row) => [row.id, row]));

    return nextRows.map((nextRow) => {
        const previousRow = previousById.get(nextRow.id);
        if (!previousRow) return nextRow;

        const keys = new Set([...Object.keys(previousRow), ...Object.keys(nextRow)]);
        const isUnchanged = [...keys].every((key) =>
            Object.is(previousRow[key as keyof T], nextRow[key as keyof T]),
        );

        return isUnchanged ? previousRow : nextRow;
    });
};
