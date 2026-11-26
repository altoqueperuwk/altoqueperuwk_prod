import type { ReactNode } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";

/** Conserva formularios inline y da a los diálogos foco, Escape y scroll seguro. */
export const CompensacionSurface = ({
    children,
    onClose,
    title,
    inline = false,
    busy = false,
    drawer = false,
    fullWidth = false,
    maxWidth = "5xl",
}: {
    children: ReactNode;
    onClose: () => void;
    title: string;
    inline?: boolean;
    busy?: boolean;
    drawer?: boolean;
    fullWidth?: boolean;
    maxWidth?: "4xl" | "5xl";
}) => {
    if (inline) return <div className={fullWidth ? "w-full min-w-0" : "w-full max-w-3xl min-w-0"}>{children}</div>;
    return (
        <ModalOverlay
            isOpen
            isDismissable={!busy}
            isKeyboardDismissDisabled={busy}
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
            className={drawer ? "items-stretch justify-end p-0 sm:justify-end sm:p-0" : "items-center p-3 sm:p-6"}
        >
            <Modal className={drawer ? "h-dvh max-w-2xl" : maxWidth === "4xl" ? "max-w-4xl" : "max-w-5xl"}>
                <Dialog
                    aria-label={title}
                    className={
                        drawer
                            ? "relative h-full min-w-0 [&>aside]:min-w-0 [&>aside]:overflow-hidden [&>aside>.flex-1]:min-h-0 [&>aside>div:first-child]:max-h-[50dvh] [&>aside>div:first-child]:overflow-y-auto"
                            : "compensacion-dialog relative min-w-0 [&_.justify-end]:flex-wrap [&_a]:break-all [&_p]:break-words [&>div]:max-h-[calc(100dvh-3rem)] [&>div]:min-w-0 [&>div]:overflow-y-auto [&>div>.flex-1]:shrink [&>div>div]:min-h-0 [&>div>div]:shrink-0 [&>div>div:first-child]:gap-3"
                    }
                >
                    {children}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};
