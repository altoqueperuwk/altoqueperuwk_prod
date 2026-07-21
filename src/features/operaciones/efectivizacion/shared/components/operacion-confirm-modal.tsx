import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";

interface OperacionConfirmModalProps {
    cancelLabel?: string;
    confirmLabel?: string;
    description: string;
    intent?: "primary" | "destructive";
    isLoading?: boolean;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
}

export const OperacionConfirmModal = ({
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
                <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-lg font-semibold text-primary">{title}</h2>
                        <p className="text-sm text-tertiary">{description}</p>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
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
