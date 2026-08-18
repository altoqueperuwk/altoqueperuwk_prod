export const sanitizeAmountInput = (value: string) => {
    const normalized = value.trim().replace(/\s/g, "");
    if (!normalized) return "";

    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    const separatorIndex = Math.max(lastComma, lastDot);

    if (separatorIndex < 0) {
        return normalized.replace(/\D/g, "");
    }

    const integerPart = normalized.slice(0, separatorIndex).replace(/\D/g, "");
    const fractionPart = normalized.slice(separatorIndex + 1).replace(/\D/g, "");

    // A separator followed by more than two digits is a thousands separator.
    if (fractionPart.length > 2) {
        return normalized.replace(/\D/g, "");
    }

    return `${integerPart}.${fractionPart}`;
};
