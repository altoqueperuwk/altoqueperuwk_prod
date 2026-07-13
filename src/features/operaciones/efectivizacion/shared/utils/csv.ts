export const csvValue = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export const buildCsv = (headers: string[], rows: unknown[][]) =>
    [headers.map(csvValue).join(","), ...rows.map((row) => row.map(csvValue).join(","))].join("\n");

export const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};
