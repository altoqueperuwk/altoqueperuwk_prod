const currencyFormatter = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
});

export const formatMoney = (value: number | null | undefined) => currencyFormatter.format(Number(value ?? 0));

export const formatInteger = (value: number | null | undefined) => new Intl.NumberFormat("es-PE").format(Number(value ?? 0));
