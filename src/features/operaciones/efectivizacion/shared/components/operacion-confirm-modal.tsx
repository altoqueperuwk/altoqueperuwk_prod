import type { ReactNode } from "react";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface OperacionConfirmModalProps {
    children?: ReactNode;
    cancelLabel?: string;
    confirmLabel?: string;
    description: ReactNode;
    intent?: "primary" | "destructive";
    isLoading?: boolean;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
}

export const OperacionConfirmModal = ({
    children,
    cancelLabel = "Cancelar",
    confirmLabel = "Confirmar",
    description,
    intent = "primary",
    isLoading = false,
    isOpen,
    onClose,
    onConfirm,
    title,
}: OperacionConfirmModalProps) => (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Modal className="max-w-md">
            <Dialog>
                <div className="w-full overflow-hidden rounded-xl bg-primary shadow-xl ring-1 ring-secondary">
                    <div className="atk-strip px-5">
                        <h2 className="text-sm font-semibold text-primary">{title}</h2>
                    </div>
                    <div className="px-5 py-4">
                        <p className="text-sm text-tertiary">{description}</p>
                        {children}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-secondary px-5 py-3">
                        <Button color="secondary" isDisabled={isLoading} onClick={onClose}>
                            {cancelLabel}
                        </Button>
                        <Button
                            color={intent === "destructive" ? "primary-destructive" : "primary"}
                            isLoading={isLoading}
                            onClick={onConfirm}
                        >
                            {confirmLabel}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </Modal>
    </ModalOverlay>
);
