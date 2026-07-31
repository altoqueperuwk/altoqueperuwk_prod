import { InputBase } from "@/components/base/input/input";
import { InputGroup } from "@/components/base/input/input-group";
import { NativeSelect } from "@/components/base/select/select-native";

export type TipoDocumentoOperacion = 1 | 2;

export const DOCUMENTO_OPTIONS = [
    { label: "DNI", value: "1" },
    { label: "CE", value: "2" },
];

export const getDocumentoMaxLength = (tipoDocumento: number) => (Number(tipoDocumento) === 2 ? 9 : 8);

export const getDocumentoNombre = (tipoDocumento: number) => (Number(tipoDocumento) === 2 ? "CE" : "DNI");

export const cleanDocumento = (value: string, tipoDocumento: number) =>
    value.replace(/\D/g, "").slice(0, getDocumentoMaxLength(tipoDocumento));

export const getDocumentoValidationMessage = (value: string, tipoDocumento: number) => {
    const cleanValue = cleanDocumento(value, tipoDocumento);
    const expectedLength = getDocumentoMaxLength(tipoDocumento);

    if (cleanValue.length === expectedLength) return null;

    return Number(tipoDocumento) === 2
        ? "El CE debe tener exactamente 9 dígitos."
        : "El DNI debe tener exactamente 8 dígitos.";
};

interface DocumentoInputGroupProps {
    tipoDocumento: TipoDocumentoOperacion;
    numeroDocumento: string;
    onTipoDocumentoChange: (tipoDocumento: TipoDocumentoOperacion) => void;
    onNumeroDocumentoChange: (numeroDocumento: string) => void;
    label?: string;
    isRequired?: boolean;
    isDisabled?: boolean;
    className?: string;
}

export const DocumentoInputGroup = ({
    className,
    isDisabled = false,
    isRequired = false,
    label = "Documento",
    numeroDocumento,
    onNumeroDocumentoChange,
    onTipoDocumentoChange,
    tipoDocumento,
}: DocumentoInputGroupProps) => {
    const maxLength = getDocumentoMaxLength(tipoDocumento);
    const documentoNombre = getDocumentoNombre(tipoDocumento);

    return (
        <InputGroup
            size="sm"
            label={label}
            isRequired={isRequired}
            isDisabled={isDisabled}
            className={className}
            leadingAddon={
                <NativeSelect
                    aria-label="Tipo documento"
                    size="sm"
                    value={String(tipoDocumento)}
                    onChange={(event) => {
                        const nextTipo = Number(event.currentTarget.value) as TipoDocumentoOperacion;
                        onTipoDocumentoChange(nextTipo);
                        onNumeroDocumentoChange(cleanDocumento(numeroDocumento, nextTipo));
                    }}
                    options={DOCUMENTO_OPTIONS}
                    disabled={isDisabled}
                />
            }
        >
            <InputBase
                type="text"
                inputMode="numeric"
                size="sm"
                value={numeroDocumento}
                maxLength={maxLength}
                placeholder={`${documentoNombre} ${maxLength} dígitos`}
                onChange={(event) => onNumeroDocumentoChange(cleanDocumento(event.currentTarget.value, tipoDocumento))}
            />
        </InputGroup>
    );
};
