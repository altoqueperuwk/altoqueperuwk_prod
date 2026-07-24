const interactiveSelector = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "[contenteditable='true']",
    "[data-prevent-row-select]",
    "[role='button']",
    "[role='checkbox']",
    "[role='combobox']",
    "[role='listbox']",
    "[role='menu']",
    "[role='menuitem']",
    "[role='option']",
    "[role='radio']",
    "[role='switch']",
    "[role='textbox']",
].join(",");

export const isInteractiveElement = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(interactiveSelector));
};
