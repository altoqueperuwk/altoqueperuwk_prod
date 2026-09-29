const MONTHS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];

const parseIsoDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return { year, month, day };
};

export const formatMetricasDateRange = (from: string, to: string) => {
    const start = parseIsoDate(from);
    const end = parseIsoDate(to);

    if (start.year === end.year && start.month === end.month && start.day === end.day) {
        return `${start.day} ${MONTHS[start.month - 1]} ${start.year}`;
    }

    if (start.year === end.year && start.month === end.month) {
        return `${start.day} - ${end.day} ${MONTHS[end.month - 1]} ${end.year}`;
    }

    if (start.year === end.year) {
        return `${start.day} ${MONTHS[start.month - 1]} - ${end.day} ${MONTHS[end.month - 1]} ${end.year}`;
    }

    return `${start.day} ${MONTHS[start.month - 1]} ${start.year} - ${end.day} ${MONTHS[end.month - 1]} ${end.year}`;
};
