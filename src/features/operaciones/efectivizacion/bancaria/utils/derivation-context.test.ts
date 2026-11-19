import { describe, expect, it } from "vitest";
import { isSelfDerivedOperation, isDerivedOriginForContext, isDerivedReceiverOperation } from "./derivation-context";
const legacy = {flag_derivado:true,ruta_origen:"interbank",ruta_destino:"interbank",id_empresa_salida:3,id_empresa_salida_origen:3,id_empresa_cuenta_salida:20,id_empresa_cuenta_salida_origen:20};
describe("derivaciones a la misma cuenta",()=>{
    it.each(["bcp","bbva","interbank","scotiabank","banbif","safetypay"])("habilita el destino retroactivo en %s sin reescribir el registro",ruta=>{
        const row={...legacy,ruta_origen:ruta,ruta_destino:ruta};
        expect(isSelfDerivedOperation(row)).toBe(true);
        expect(isDerivedOriginForContext(row,3,20)).toBe(false);
        expect(isDerivedReceiverOperation(row,3,20)).toBe(true);
        expect(isDerivedReceiverOperation(row,3,null)).toBe(true);
        expect(isDerivedReceiverOperation(row,5,20)).toBe(false);
        expect(isDerivedReceiverOperation(row,3,99)).toBe(false);
    });
    it("mantiene congelado el origen cuando la empresa destino es otra",()=>{
        const row={...legacy,id_empresa_salida:5,id_empresa_cuenta_salida:30};
        expect(isSelfDerivedOperation(row)).toBe(false);
        expect(isDerivedOriginForContext(row,3,20)).toBe(true);
        expect(isDerivedReceiverOperation(row,3,20)).toBe(false);
        expect(isDerivedReceiverOperation(row,5,30)).toBe(true);
    });
    it("distingue cuentas diferentes de una misma empresa",()=>{
        const row={...legacy,id_empresa_cuenta_salida:30};
        expect(isSelfDerivedOperation(row)).toBe(false);
        expect(isDerivedOriginForContext(row,3,20)).toBe(true);
        expect(isDerivedOriginForContext(row,3,30)).toBe(false);
        expect(isDerivedReceiverOperation(row,3,20)).toBe(false);
        expect(isDerivedReceiverOperation(row,3,30)).toBe(true);
    });
    it.each(["id_empresa_salida","id_empresa_salida_origen","id_empresa_cuenta_salida","id_empresa_cuenta_salida_origen"] as const)("no infiere igualdad con %s ausente",key=>{
        expect(isSelfDerivedOperation({...legacy,[key]:null})).toBe(false);
    });
    it("respeta otras rutas y operaciones sin derivar",()=>{
        expect(isSelfDerivedOperation({...legacy,ruta_destino:"bcp"})).toBe(false);
        expect(isSelfDerivedOperation({...legacy,flag_derivado:false})).toBe(false);
        expect(isDerivedOriginForContext({...legacy,flag_derivado:false},3,20)).toBe(false);
        expect(isDerivedReceiverOperation({...legacy,flag_derivado:false},3,20)).toBe(false);
    });
});
