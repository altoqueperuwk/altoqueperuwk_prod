import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { DashboardPersonal } from "./dashboard-personal";

const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: { estado: "SIN_FUENTE" }, error: null }) } }));
vi.mock("../bonos-descuentos/bonos-descuentos.service", () => ({ bonosDescuentosService: { dashboard: mocks.dashboard } }));
const profileState = vi.hoisted(() => ({ pagos: false, marketing: false }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({
        isAdvisor: false,
        isStoreManager: false,
        isFacturacion: !profileState.pagos && !profileState.marketing,
        isPagos: profileState.pagos,
        isMarketing: profileState.marketing,
        isResolving: false,
    }),
}));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/providers/auth-provider", () => ({ useOptionalAuth: () => ({ user: { id: "own-user" } }) }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, label }: { value: string; label: string }) => <input aria-label={label} type="month" value={value} readOnly />,
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value }: { label: string; value: string }) => <input aria-label={label} type="date" value={value} readOnly />,
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        selectedKey,
        items,
        "aria-label": ariaLabel,
    }: {
        label?: string;
        selectedKey: string;
        items: { id: string | number; label: string }[];
        "aria-label"?: string;
    }) => (
        <select aria-label={label ?? ariaLabel ?? "Tamaño de página"} value={selectedKey} onChange={() => undefined}>
            {items.map((item) => (
                <option key={item.id} value={item.id}>
                    {item.label}
                </option>
            ))}
        </select>
    );
    Select.Item = () => null;
    return { Select };
});

/** Los 10 conceptos del catálogo de Facturación (f_private_compensacion_mis_bonos_catalogo(5)) y su opción de origen (matriz 01). */
const catalogo = [
    ["BONO_DETECCION_ERROR_PAGO", "Detección de Error de Pago", "BONO", "Auditoría de Pagos", "/compensaciones/auditoria-activa"],
    ["BONO_OPERACION_EXTRA", "Operación Extra", "BONO", "Auditoría de Pagos", "/compensaciones/auditoria-activa"],
    ["BONO_INNOVACION", "Propuesta de Innovación", "BONO", "Propuesta de Innovación", "/compensaciones/otros-bonos/propuesta_innovacion"],
    ["COMISION_REFERIDO", "Referido", "BONO", "Referidos", "/compensaciones/referidos"],
    ["FAC_ERROR_SOLUCION", "Error con Solución", "PENALIDAD", "Incidencias", "/compensaciones/incidencias"],
    ["FAC_ERROR_SIN_SOLUCION", "Error sin Solución", "PENALIDAD", "Incidencias", "/compensaciones/incidencias"],
    ["FAC_UNIFORME", "Falta de Uniforme Completo", "PENALIDAD", "Incidencias", "/compensaciones/incidencias"],
    ["FAC_INDISCIPLINA", "Indisciplina Recurrente Activa", "PENALIDAD", "Incidencias", "/compensaciones/incidencias"],
] as const;

beforeEach(() => {
    mocks.dashboard.mockResolvedValue({
        items: catalogo.map(([codigo, nombre, tipo], index) => ({
            id: `${codigo}:${index}`,
            concepto_codigo: codigo,
            concepto_nombre: nombre,
            tipo,
            fecha: `2026-11-${String(index + 1).padStart(2, "0")}`,
            descripcion: `Registro ${nombre}`,
            estado: "PENDIENTE",
            importe: null,
        })),
        total: catalogo.length,
        total_paginas: 1,
        conceptos: catalogo.map(([codigo, nombre]) => ({ codigo, concepto: nombre })),
        kpis: { bonos: 0, comisiones: 0, descuentos: 0, neto: 0, pendientes: catalogo.length },
        disponible: true,
    });
});
afterEach(() => {
    cleanup();
    profileState.pagos = false;
    profileState.marketing = false;
});

const open = () =>
    render(
        <MemoryRouter>
            <DashboardPersonal />
        </MemoryRouter>,
    );

/** Toda fila abre el mismo formulario de lectura sin salir del listado; el enlace a la opción de origen vive dentro de él. */
const comprobarAccion = (fila: HTMLElement, _modulo: string, _href: string, nombre: string) => {
    const boton = fila.querySelector(`button[aria-label^="Ver detalle de"]`);
    expect(boton, `${nombre}: botón de detalle`).not.toBeNull();
    expect(fila.querySelector("a"), `${nombre}: la fila no enlaza`).toBeNull();
};
const abierto = async () => {
    open();
    await waitFor(() => expect(screen.getByText("Registro Referido")).toBeVisible());
};
const comprobarOrigen = (filas: (typeof catalogo)[number][]) => {
    for (const [, nombre, , modulo, href] of filas) {
        const fila = screen.getByText(`Registro ${nombre}`).closest("tr")!;
        expect(fila).toHaveTextContent(modulo);
        comprobarAccion(fila, modulo, href, nombre);
    }
};

it("Facturación: los conceptos con destino propio muestran Origen y una flecha a la opción de la matriz", async () => {
    await abierto();
    comprobarOrigen(catalogo.filter(([codigo]) => !["FAC_UNIFORME", "FAC_INDISCIPLINA"].includes(codigo)));
});

// Pedido C-1: el mapa de Origen envía Uniforme e Indisciplina a la vista por concepto, que no es del menú de Facturación.
it("Facturación: Uniforme e Indisciplina llevan a Indisciplina Colaborador del equipo sin vista por concepto", async () => {
    await abierto();
    comprobarOrigen(catalogo.filter(([codigo]) => ["FAC_UNIFORME", "FAC_INDISCIPLINA"].includes(codigo)));
});

it("Facturación: el Dashboard es informativo y la tabla usa Monto", async () => {
    await abierto();
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByRole("columnheader", { name: "Origen" })).toBeVisible();
    expect(within(tabla).getByRole("columnheader", { name: "Monto" })).toBeVisible();
    expect(within(tabla).queryByText(/Importe/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar|Aprobar|Rechazar/ })).toBeNull();
});

// Pedido C-2: el subtítulo de las tarjetas dice "Importe habilitado del periodo".
it("Facturación: ningún texto del Dashboard dice Importe", async () => {
    await abierto();
    expect(screen.queryByText(/Importe/)).toBeNull();
});

it("Facturación: el filtro Concepto lista el catálogo sin duplicados", async () => {
    await abierto();
    const opciones = Array.from(screen.getByRole("combobox", { name: "Concepto" }).querySelectorAll("option")).map((option) => option.textContent);
    expect(opciones).toEqual(["Todos los conceptos", ...catalogo.map(([, nombre]) => nombre)]);
    expect(new Set(opciones).size).toBe(opciones.length);
});

// Pedido C-2: Estado de Origen ofrece estados de pago y operación (Habilitado, Pago parcial, Esperando operación…).
it("Facturación: el filtro de Estado solo ofrece Pendiente, Aprobado y Rechazado", async () => {
    await abierto();
    const opciones = Array.from(screen.getByRole("combobox", { name: "Estado de Origen" }).querySelectorAll("option")).map((option) => option.textContent);
    expect(opciones).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
});

describe("Dashboard con Pagos", () => {
    const pagos = [
        ["BONO_CUADRE_PERFECTO", "Cuadre Perfecto", "BONO", "Auditoría Cuadre y Cierre", "/compensaciones/auditoria-cuadre-cierre"],
        ["BONO_DETECCION_ERROR_MANUAL", "Detección de Error Manual", "BONO", "Auditoría de Pagos", "/compensaciones/auditoria-activa"],
        ["BONO_INNOVACION", "Propuesta de Innovación", "BONO", "Propuesta de Innovación", "/compensaciones/otros-bonos/propuesta_innovacion"],
        ["BONO_REGISTRO_PRESENCIAL", "Registro Presencial", "BONO", "Registro Nuevo", "/compensaciones/atenciones"],
        ["BONO_REPORTE_ABANDONO", "Reporte de Abandono", "BONO", "Abandono Comercial", "/compensaciones/otros-bonos/reporte_abandono"],
        ["COMISION_REFERIDO", "Referido", "BONO", "Referidos", "/compensaciones/referidos"],
        ["COMISION_REGISTRO_EFECTIVIZACION", "Registro y Efectivización", "BONO", "Registro Nuevo", "/compensaciones/atenciones"],
        ["COMISION_TIKTOK_LIVE", "TikTok Live", "BONO", "TikTok Live", "/compensaciones/otros-bonos/tiktok_live"],
        ["PAG_CIERRE_INCOMPLETO", "Cierre Diario Incompleto", "PENALIDAD", "Auditoría Cuadre y Cierre", "/compensaciones/auditoria-cuadre-cierre"],
        ["PAG_DESCUADRE", "Descuadre", "PENALIDAD", "Auditoría Cuadre y Cierre", "/compensaciones/auditoria-cuadre-cierre"],
        ["PAG_ERROR_CUADRO", "Error en Cuadro de Comisiones", "PENALIDAD", "Incidencias", "/compensaciones/incidencias"],
        ["PAG_ERROR_PAGO_CRITICO", "Error de Pago Crítico", "PENALIDAD", "Auditoría Operaciones", "/compensaciones/auditoria-operaciones"],
        ["PAG_INDISCIPLINA", "Indisciplina Recurrente Activa", "PENALIDAD", "Incidencias", "/compensaciones/incidencias?concepto=indisciplina"],
        ["PAG_RETRASO_VOUCHER", "Retraso de Vouchers", "PENALIDAD", "Auditoría Operaciones", "/compensaciones/auditoria-operaciones"],
        ["PAG_UNIFORME", "Falta de Uniforme Completo", "PENALIDAD", "Incidencias", "/compensaciones/incidencias?concepto=uniforme"],
    ] as const;
    beforeEach(() => {
        profileState.pagos = true;
        mocks.dashboard.mockResolvedValue({
            items: pagos.map(([codigo, nombre, tipo], index) => ({
                id: `${codigo}:${index}`,
                concepto_codigo: codigo,
                concepto_nombre: nombre,
                tipo,
                fecha: `2026-11-${String(index + 1).padStart(2, "0")}`,
                descripcion: `Registro ${nombre}`,
                estado: "PENDIENTE",
                importe: null,
            })),
            total: pagos.length,
            total_paginas: 1,
            conceptos: pagos.map(([codigo, nombre]) => ({ codigo, concepto: nombre })),
            kpis: { bonos: 0, comisiones: 0, descuentos: 0, neto: 0, pendientes: pagos.length },
            disponible: true,
        });
    });
    // Pedido c-1: la matriz lleva Uniforme e Indisciplina de Pagos a Incidencias (lectura), sin la vista por concepto.
    const conVistaPorConcepto = ["PAG_UNIFORME", "PAG_INDISCIPLINA"];
    it("los conceptos muestran Origen, flecha y ayuda del concepto; ya no hay acceso a Control de Pagos", async () => {
        open();
        await waitFor(() => expect(screen.getByText("Registro Referido")).toBeVisible());
        for (const [codigo, nombre, , modulo, href] of pagos) {
            const fila = screen.getByText(`Registro ${nombre}`).closest("tr")!;
            expect(fila).toHaveTextContent(modulo);
            if (!conVistaPorConcepto.includes(codigo)) comprobarAccion(fila, modulo, href, nombre);
            expect(fila.querySelector("[title]"), `ayuda de ${nombre}`).not.toBeNull();
        }
        expect(screen.queryByRole("link", { name: "Control de Pagos" })).toBeNull();
        expect(screen.queryByRole("button", { name: /Editar|Aprobar|Rechazar/ })).toBeNull();
        expect(screen.queryByText(/Importe/)).toBeNull();
    });
    it("Uniforme e Indisciplina llevan a Incidencias sin vista por concepto", async () => {
        open();
        await waitFor(() => expect(screen.getByText("Registro Referido")).toBeVisible());
        for (const nombre of ["Falta de Uniforme Completo", "Indisciplina Recurrente Activa"])
            expect(screen.getByText(`Registro ${nombre}`).closest("tr")!.querySelector(`button[aria-label^="Ver detalle de"]`)).not.toBeNull();
    });
    it("el filtro por grupo ofrece Pendiente, Aprobado y Rechazado y el Concepto no repite", async () => {
        open();
        await waitFor(() => expect(screen.getByText("Registro Referido")).toBeVisible());
        const estados = Array.from(screen.getByRole("combobox", { name: "Estado de Origen" }).querySelectorAll("option")).map((option) => option.textContent);
        expect(estados).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
        const conceptos = Array.from(screen.getByRole("combobox", { name: "Concepto" }).querySelectorAll("option")).map((option) => option.textContent);
        expect(new Set(conceptos).size).toBe(conceptos.length);
        expect(conceptos).toHaveLength(pagos.length + 1);
    });
});

describe("Dashboard con Marketing", () => {
    const marketing = [
        ["BONO_INNOVACION", "Propuesta de Innovación", "BONO", "Propuesta de Innovación", "/compensaciones/otros-bonos/propuesta_innovacion"],
        ["BONO_RECUPERACION", "Recuperación de Cliente", "BONO", "Recuperación", "/compensaciones/otros-bonos/recuperacion_cliente"],
        ["BONO_VIDEO_VIRAL", "Video Viral", "BONO", "Video Viral", "/compensaciones/otros-bonos/video_viral"],
        ["COMISION_ALERTA_TEMPRANA", "Alerta Temprana", "BONO", "Auditoría Operaciones", "/compensaciones/auditoria-operaciones"],
        ["COMISION_REFERIDO", "Referido", "BONO", "Referidos", "/compensaciones/referidos"],
        ["COMISION_TIKTOK_LIVE", "TikTok Live", "BONO", "TikTok Live", "/compensaciones/otros-bonos/tiktok_live"],
        ["MKT_INDISCIPLINA", "Indisciplina Recurrente Activa", "PENALIDAD", "Indisciplina Colaborador", "/compensaciones/indisciplina-colaborador"],
        ["MKT_UNIFORME", "Falta de Uniforme Completo", "PENALIDAD", "Indisciplina Colaborador", "/compensaciones/indisciplina-colaborador"],
    ] as const;
    beforeEach(() => {
        profileState.marketing = true;
        mocks.dashboard.mockResolvedValue({
            items: marketing.map(([codigo, nombre, tipo], index) => ({
                id: `${codigo}:${index}`,
                concepto_codigo: codigo,
                concepto_nombre: nombre,
                tipo,
                fecha: `2026-11-${String(index + 1).padStart(2, "0")}`,
                descripcion: `Registro ${nombre}`,
                estado: "PENDIENTE",
                importe: null,
            })),
            total: marketing.length,
            total_paginas: 1,
            conceptos: marketing.map(([codigo, nombre]) => ({ codigo, concepto: nombre })),
            kpis: { bonos: 0, comisiones: 0, descuentos: 0, neto: 0, pendientes: marketing.length },
            disponible: true,
        });
    });
    const abrir = async () => {
        open();
        await waitFor(() => expect(screen.getByText("Registro Video Viral")).toBeVisible());
    };
    it('los conceptos muestran Origen, flecha "Ver en <opción>" y ayuda del concepto', async () => {
        await abrir();
        for (const [, nombre, , modulo, href] of marketing) {
            const fila = screen.getByText(`Registro ${nombre}`).closest("tr")!;
            expect(fila).toHaveTextContent(modulo);
            comprobarAccion(fila, modulo, href, nombre);
            expect(fila.querySelector("[title]"), `ayuda de ${nombre}`).not.toBeNull();
        }
    });
    it("Video Viral y Recuperación son opciones distintas; Uniforme e Indisciplina llevan a Incidencias", async () => {
        await abrir();
        const destino = (nombre: string) => {
            fireEvent.click(screen.getByText(`Registro ${nombre}`).closest("tr")!.querySelector(`button[aria-label^="Ver detalle de"]`)!);
            const href = screen.getByRole("link", { name: /^Ir a / }).getAttribute("href");
            fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" }).at(-1)!);
            return href;
        };
        expect(destino("Video Viral")).toBe("/compensaciones/otros-bonos/video_viral");
        expect(destino("Recuperación de Cliente")).toBe("/compensaciones/otros-bonos/recuperacion_cliente");
        for (const nombre of ["Falta de Uniforme Completo", "Indisciplina Recurrente Activa"])
            expect(screen.getByText(`Registro ${nombre}`).closest("tr")!.querySelector(`button[aria-label^="Ver detalle de"]`)).not.toBeNull();
    });
    it("Alerta Temprana indica que validan Jefe y Administrador; Recuperación ya no pasa por el Jefe", async () => {
        await abrir();
        const ayuda = (nombre: string) => screen.getByText(`Registro ${nombre}`).closest("tr")!.querySelector("[title]")?.getAttribute("title");
        expect(ayuda("Alerta Temprana")).toContain("Valida: Jefe de Tienda y Administrador");
        expect(ayuda("Recuperación de Cliente")).not.toContain("Jefe de Tienda");
    });
    it("es informativo: filtro por grupo sin duplicados, sin acciones de edición, sin Importe", async () => {
        await abrir();
        const estados = Array.from(screen.getByRole("combobox", { name: "Estado de Origen" }).querySelectorAll("option")).map((option) => option.textContent);
        expect(estados).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
        const conceptos = Array.from(screen.getByRole("combobox", { name: "Concepto" }).querySelectorAll("option")).map((option) => option.textContent);
        expect(new Set(conceptos).size).toBe(conceptos.length);
        expect(conceptos).toHaveLength(marketing.length + 1);
        expect(screen.queryByRole("button", { name: /Editar|Aprobar|Rechazar/ })).toBeNull();
        expect(screen.queryByText(/Importe/)).toBeNull();
        expect(screen.queryByRole("link", { name: "Control de Pagos" })).toBeNull();
    });
});
