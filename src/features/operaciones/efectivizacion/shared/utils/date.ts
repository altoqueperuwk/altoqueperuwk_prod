const getDatePart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

export const getPeruDateValue = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).formatToParts(date);

    return `${getDatePart(parts, "year")}-${getDatePart(parts, "month")}-${getDatePart(parts, "day")}`;
};

export const toPeruDayStart = (date: string) => `${date}T00:00:00-05:00`;

export const toPeruDayEnd = (date: string) => `${date}T23:59:59.999-05:00`;

export const getPeruTimestamp = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";

    return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}-05:00`;
};

export const formatDateValue = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day)));
};
