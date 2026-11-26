import { parseDate } from "@internationalized/date";

/** Conserva el día elegido y toma la hora de Lima al guardar, no al abrir el formulario. */
export const innovacionFechaEvento = (day: string, now = new Date()) => {
    const date = parseDate(day).toString();
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(
        now,
    );
    return `${date}T${time}-05:00`;
};
