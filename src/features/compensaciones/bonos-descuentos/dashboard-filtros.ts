/** Calendar month in Lima; UTC is only used for calendar arithmetic. */
export const dashboardMes = (date = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(date);
export const dashboardLimites = (mes: string) => {
    const [year, month] = mes.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${last}` };
};
