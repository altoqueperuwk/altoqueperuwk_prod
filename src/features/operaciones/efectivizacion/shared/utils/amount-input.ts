export const sanitizeAmountInput = (value: string) => {
    let result = "";
    let hasSeparator = false;

    for (const char of value) {
        if (/\d/.test(char)) {
            result += char;
            continue;
        }

        if ((char === "." || char === ",") && !hasSeparator) {
            result += char;
            hasSeparator = true;
        }
    }

    return result;
};
