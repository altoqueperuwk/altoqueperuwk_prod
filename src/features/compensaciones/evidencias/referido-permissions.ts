import type { LlamadaContexto } from "./evidencias.types";
import type { Referido } from "./referidos.service";

/** Sin autor/beneficiario verificables no se ofrece una decisión sobre un ingreso. */
export const isOtherReferral = (item: Referido, context: LlamadaContexto | null) =>
    Boolean(
        context &&
        Number(item.id_usuario_registra) > 0 &&
        Number(item.id_usuario_registra) !== context.idUsuario &&
        (!context.idColaborador || (Number(item.id_colaborador_referente) > 0 && Number(item.id_colaborador_referente) !== context.idColaborador)),
    );
