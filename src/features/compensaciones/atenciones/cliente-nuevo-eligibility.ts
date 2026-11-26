import type { ClienteNuevo } from "./clientes-nuevos.service";

export const canEditCliente = (client: ClienteNuevo) =>
    client.puede_editar === true &&
    client.estado === "ESPERANDO_OPERACION" &&
    !client.operacion &&
    !client.id_operacion &&
    Number.isFinite(Date.parse(client.vence)) &&
    Date.now() <= Date.parse(client.vence);
