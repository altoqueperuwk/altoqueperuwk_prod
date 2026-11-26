import { type ReactNode, useState } from "react";

export const CompensacionRegistro = ({
    title,
    isDisabled,
    onSaved,
    children,
}: {
    title: string;
    label: string;
    isDisabled?: boolean;
    onSaved: () => void;
    children: (controls: { onSave: () => void; onBusyChange: (busy: boolean) => void }) => ReactNode;
}) => {
    const [revision, setRevision] = useState(0);
    return (
        <section className="w-full rounded-xl border border-secondary bg-primary p-5 shadow-xs" aria-label={title}>
            <h2 className="mb-4 text-sm font-semibold text-primary">{title}</h2>
            <fieldset key={revision} disabled={isDisabled} className="min-w-0 border-0 p-0">
                {children({
                    onBusyChange: () => {},
                    onSave: () => {
                        if (isDisabled) return;
                        setRevision((value) => value + 1);
                        onSaved();
                    },
                })}
            </fieldset>
        </section>
    );
};
