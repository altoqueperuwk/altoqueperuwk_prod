import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { findExcelHeaderIndex, getExcelAliases, mapExcelRows, normalizeExcelHeader, parseBcpTxtRows, readExcelRowsFromFile } from "./excel-parser";

// Trama sintética de ancho fijo; no contiene datos del reporte de clientes.
const bcpDocumentRow = (document: string, secondDocument = document) => {
    const line = " ".repeat(203).split("");
    const put = (start: number, value: string) => line.splice(start, value.length, ...value);
    put(0, "DD19100000000");
    put(13, document);
    put(57, "20261030");
    put(73, "000000000100000");
    put(130, "EFECTIVO");
    put(138, secondDocument);
    put(152, "    BM          ");
    put(168, "103924");
    put(187, "0100000000000123");
    return line.join("");
};

describe("documentos de TXT BCP", () => {
    it.each([
        ["00000012345678", "12345678"],
        ["00000001234567", "01234567"],
        ["00000412345678", "12345678"],
        ["00000101234567", "01234567"],
        ["     12345678I", "12345678"],
        ["     01234567I", "01234567"],
    ])("normaliza %s sin alterar los demás datos de la operación", (document, expected) => {
        const rows = parseBcpTxtRows(bcpDocumentRow(document));
        expect(rows).toEqual([{
            dni: `EFECTIVO000000${expected}`,
            monto: "1000", codigo_operacion: "00000123",
            fecha_pago: "2026-10-30 00:00:00", hora_proceso: "10:39:24",
            nombre_cliente_banco_ingreso: "BCP", estado: "",
        }]);
    });

    it.each([
        "00001234567890", // Diez dígitos significativos: no truncar indiscriminadamente.
        "     12345678X",
        "     12345678i",
        "     123I56789",
        "      1234567I",
        "    123456789I",
        "              ",
    ])("rechaza el documento no contemplado %s", (document) => {
        expect(parseBcpTxtRows(bcpDocumentRow(document))).toEqual([]);
    });

    it("rechaza campos discordantes en el caso con I", () => {
        expect(parseBcpTxtRows(bcpDocumentRow("     12345678I", "     87654321I"))).toEqual([]);
        expect(parseBcpTxtRows(bcpDocumentRow("00000012345678", "     12345678I"))).toEqual([]);
    });

    it.each([0, 2, 57, 73, 168, 187])("mantiene la validación de la trama en la posición %s", (position) => {
        const line = bcpDocumentRow("     12345678I");
        expect(parseBcpTxtRows(line.slice(0, position) + "X" + line.slice(position + 1))).toEqual([]);
    });

    it("excluye la cabecera y mantiene el orden de los tres formatos válidos", () => {
        const rows = parseBcpTxtRows([
            "CC19100000000P20261030",
            bcpDocumentRow("00000012345678"),
            bcpDocumentRow("00000412345679"),
            bcpDocumentRow("     12345680I"),
        ].join("\r\n"));
        expect(rows.map((row) => row.dni)).toEqual([
            "EFECTIVO00000012345678", "EFECTIVO00000012345679", "EFECTIVO00000012345680",
        ]);
    });

    it("lee un archivo TXT con ambos casos mediante el mismo contrato de carga", async () => {
        const content = ["CC19100000000", bcpDocumentRow("00000412345678"), bcpDocumentRow("     12345679I")].join("\n");
        const bytes = new TextEncoder().encode(content);
        const file = { name: "reporte-bcp.txt", arrayBuffer: async () => bytes.buffer } as File;
        const rows = await readExcelRowsFromFile(file, "bcp");
        expect(rows.map((row) => row.dni)).toEqual(["EFECTIVO00000012345678", "EFECTIVO00000012345679"]);
        await expect(readExcelRowsFromFile(file, "bbva")).rejects.toThrow("solo esta soportado para BCP");
    });
});

describe("Excel histórico BCP", () => {
    const headers = ["Fecha", "Fecha valuta", "Descripción operación", "Monto", "Saldo", "Sucursal - agencia", "Operación - Número", "Operación - Hora", "Usuario", "UTC", "Referencia2"];
    const movement = (description: string, amount = 250) => ["05/11/2026", "", description, amount, 1000, "111-023", "00123456", "07:08:09", "CAJERO", "1013", ""];

    it.each(["bcp", "/operaciones/bcp"] as const)("mapea las columnas y filtra únicamente EFECTIVO en %s", (route) => {
        const rows = mapExcelRows([
            ["Cuenta", "Cuenta de prueba"], ["Moneda", "Soles"], ["Tipo de Cuenta", "Corriente"], [],
            headers,
            movement("IMPUESTO ITF", -1), movement("COMIS.RECAUDACION", -12), movement("A OTRA CUENTA", -100),
            movement("EFECTIVO00000001234567"),
        ], route);
        expect(rows).toEqual([{
            dni: "EFECTIVO00000001234567", monto: "250", codigo_operacion: "00123456",
            fecha_pago: "2026-11-05 00:00:00", hora_proceso: "07:08:09",
            nombre_cliente_banco_ingreso: null, estado: null,
        }]);
    });

    it("aplica la coincidencia por contenido e ignora mayúsculas/minúsculas", () => {
        const rows = mapExcelRows([headers, movement("  pago efectivo00000001234567  "), movement("EFECTIVO00000012345678")], "bcp");
        expect(rows).toHaveLength(2);
        expect(rows[0].dni).toBe("pago efectivo00000001234567");
    });

    it("no busca EFECTIVO en otras columnas para admitir la fila", () => {
        const nonCash = movement("TRANSFERENCIA"); nonCash[10] = "EFECTIVO";
        const rows = mapExcelRows([headers, nonCash, movement("EFECTIVO00000012345678")], "bcp");
        expect(rows).toHaveLength(1);
    });

    it("rechaza un reporte que no contiene movimientos EFECTIVO", () => {
        expect(() => mapExcelRows([headers, movement("IMPUESTO ITF", -1)], "bcp")).toThrow("No se encontraron filas para procesar");
    });

    it("mantiene las filas de otros bancos sin aplicar el filtro BCP", () => {
        const rows = mapExcelRows([
            ["Código", "Importe Pagado", "Nro Movimiento", "Fecha Pago"],
            ["01234567", 250, "00123456", "05/11/2026"],
        ], "bbva");
        expect(rows).toHaveLength(1);
        expect(rows[0].dni).toBe("01234567");
        expect(rows[0].estado).toBe("");
    });

    it("conserva el formato anterior de BCP con Nro operación", () => {
        const rows = mapExcelRows([
            ["Descripción operación", "Monto", "Nro operación", "Fecha"],
            ["EFECTIVO00000001234567", 250, "00123456", "05/11/2026"],
        ], "bcp");
        expect(rows[0]).toMatchObject({ dni: "EFECTIVO00000001234567", codigo_operacion: "00123456", hora_proceso: "", nombre_cliente_banco_ingreso: "", estado: "" });
    });

    it("lee el nuevo formato desde un XLSX con la misma entrada que la interfaz", async () => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ["Cuenta", "Cuenta de prueba"], [], headers,
            movement("COMIS.RECAUDACION", -12), movement("EFECTIVO00000001234567"),
        ]), "Movimientos Históricos");
        const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
        const file = { name: "historicos-bcp.xlsx", arrayBuffer: async () => buffer } as File;
        const rows = await readExcelRowsFromFile(file, "bcp");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ codigo_operacion: "00123456", hora_proceso: "07:08:09", monto: "250", estado: null, nombre_cliente_banco_ingreso: null });
    });
});

describe("excel-parser", () => {
    it("normalizes accents, separators and spaces", () => {
        expect(normalizeExcelHeader("  Código_Operación  ")).toBe("codigo operacion");
    });

    it("finds the header row using aliases", () => {
        const rows = [
            ["Reporte BCP"],
            ["DNI", "Importe", "Nro Operacion", "Fecha Pago"],
            ["12345678", "100", "ABC", "2026-07-13"],
        ];

        expect(findExcelHeaderIndex(rows)).toBe(1);
    });

    it("maps rows to backend excel contract", () => {
        const rows = [
            ["DNI", "Importe", "Nro Operacion", "Fecha Pago", "Hora", "Banco", "Estado"],
            ["12345678", "100.50", "OP-1", "2026-07-13", "10:00", "BCP", "OK"],
        ];

        expect(mapExcelRows(rows)).toEqual([
            {
                dni: "12345678",
                monto: "100.50",
                codigo_operacion: "OP-1",
                fecha_pago: "2026-07-13 00:00:00",
                hora_proceso: "10:00",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "OK",
            },
        ]);
    });

    it("uses route aliases without changing the backend contract", () => {
        const aliases = getExcelAliases("safetypay");

        expect(aliases.codigo_operacion).toContain("transaction id");
    });

    it("maps BCP txt detail rows to the same backend contract", () => {
        const content = [
            "CC19107381361P202607090000000800000000431657500885TS0U02003003CP0000",
            "DD1910738136100000044779896                              20260709        000000000060900000000000000000000000000000000111023848075EFECTIVO00000044779896    BM          075415             0184807500496406",
        ].join("\n");

        expect(parseBcpTxtRows(content)).toEqual([
            {
                dni: "EFECTIVO00000044779896",
                monto: "609",
                codigo_operacion: "00496406",
                fecha_pago: "2026-07-09 00:00:00",
                hora_proceso: "07:54:15",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "",
            },
        ]);
    });

    it("parses BCP fixed-width rows without using the BM or TERMIB block", () => {
        const content = [
            "DD1910738003400000002539973                              20260822        000000000050000000000000000000000000000000000111023583031EFECTIVO00000002539973    BM          094548             0258303100881048                                               ",
            "DD1910738003400000074307488                              20260822        000000000048000000000000000000000000000000000111023610059EFECTIVO00000074307488TERMIB          094958             0261005906002866     ",
        ].join("\n");

        expect(parseBcpTxtRows(content)).toEqual([
            {
                dni: "EFECTIVO00000002539973",
                monto: "500",
                codigo_operacion: "00881048",
                fecha_pago: "2026-08-22 00:00:00",
                hora_proceso: "09:45:48",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "",
            },
            {
                dni: "EFECTIVO00000074307488",
                monto: "480",
                codigo_operacion: "06002866",
                fecha_pago: "2026-08-22 00:00:00",
                hora_proceso: "09:49:58",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "",
            },
        ]);
    });

    it("requires core columns before mapping rows", () => {
        const rows = [
            ["DNI", "Importe", "Fecha Pago"],
            ["12345678", "100.50", "2026-07-13"],
        ];

        expect(() => mapExcelRows(rows)).toThrow("No se encontraron encabezados de columna en el archivo.");
    });

    it("throws when no compatible header exists", () => {
        expect(() => mapExcelRows([["foo", "bar"]])).toThrow("No se encontraron encabezados de columna en el archivo.");
    });

    it("combines compatible files from a ZIP in archive order", async () => {
        const archive = new JSZip();
        const workbook = [
            ["DNI", "Importe", "Nro Operacion", "Fecha Pago", "Hora", "Banco", "Estado"],
            ["12345678", "100.50", "OP-1", "2026-07-13", "10:00", "BCP", "OK"],
        ];
        const workbookWithSheet = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbookWithSheet, XLSX.utils.aoa_to_sheet(workbook), "Datos");
        const validBuffer = XLSX.write(workbookWithSheet, { type: "array", bookType: "xlsx" });

        archive.file("01.xlsx", validBuffer);
        archive.file("02.xlsx", validBuffer);
        archive.file("notas.pdf", "ignorado");

        const zipBuffer = await archive.generateAsync({ type: "arraybuffer" });
        const zipFile = {
            name: "carga-bancaria.zip",
            arrayBuffer: async () => zipBuffer,
        } as File;
        const rows = await readExcelRowsFromFile(zipFile, "default");

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.codigo_operacion)).toEqual(["OP-1", "OP-1"]);
    });
});

describe("formatos SafetyPay", () => {
    it.each([
        [["Nro. Documento", "Importe", "Referencia", "Fecha", "Estado"], "11/12/2026 16:10:00"],
        [["Nro Documento", "Importe de la venta", "Referencia", "Fecha", "Estado"], "11/12/2026 16:10:00"],
        [["DNI", "Monto", "Referencia", "Pagado", "Estado"], "12/11/26, 4:10 p. m."],
    ])("conserva los formatos anteriores y admite el nuevo %j", (headers, date) => {
        const [row] = mapExcelRows([headers, ["01234567", 1500, "126316922236236", date, "Pagado"]], "safetypay");
        expect(row).toMatchObject({dni:"01234567", monto:"1500", codigo_operacion:"126316922236236", fecha_pago:"2026-11-12 16:10:00", estado:"Pagado"});
    });
    it.each([["12:00 a. m.", "00:00:00"], ["12:00 p. m.", "12:00:00"], ["9:03 a. m.", "09:03:00"]])("interpreta %s", (hour, expected) => {
        const [row] = mapExcelRows([["DNI","Monto","Referencia","Pagado","Estado"], ["01234567",1,"123",`12/11/26, ${hour}`,"Pagado"]], "safetypay");
        expect(row.fecha_pago).toBe(`2026-11-12 ${expected}`);
    });
    it("conserva el estado para que el servidor omita pendientes y expirados", () => {
        const rows = mapExcelRows([["DNI","Monto","Referencia","Pagado","Estado"], ...["Pagado","Pendiente","Expirado"].map(estado=>["01234567",1,"123","12/11/26, 4:10 p. m.",estado])], "safetypay");
        expect(rows.map(row=>row.estado)).toEqual(["Pagado","Pendiente","Expirado"]);
    });
});

it("lee el XLS HTML UTF-8 de SafetyPay conservando el encabezado Referencia", async () => {
    const html = '<html><head><meta charset="utf-8" /></head><body><table><tr><th>DNI</th><th>Monto</th><th>Referencia</th><th>Pagado</th><th>Estado</th></tr><tr><td>12345678</td><td>1500</td><td>126316922236236</td><td>12/11/26, 4:10 p. m.</td><td>Pagado</td></tr></table></body></html>';
    const bytes = new TextEncoder().encode(html);
    const file = {name:"safetypay.xls", arrayBuffer:async()=>bytes.buffer} as File;
    const rows = await readExcelRowsFromFile(file, "safetypay");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({codigo_operacion:"126316922236236", fecha_pago:"2026-11-12 16:10:00", estado:"Pagado"});
});

it("no desplaza columnas cuando Pagado está vacío en SafetyPay", () => {
    const rows = mapExcelRows([["Cliente","DNI","Monto","Estado","Vence","Referencia","Operación","Solicitud","Pagado"], ["Cliente", "01234567",1500,"Pendiente","12/11/26, 6:14 p. m.","", "126316922236236", "12/11/26, 4:14 p. m.", ""]], "safetypay");
    expect(rows[0]).toMatchObject({dni:"01234567", monto:"1500",estado:"Pendiente",codigo_operacion:""});
});

it("conserva ceros de operación en HTML solo para SafetyPay", async () => {
    const code = "0126321177805405";
    const html = `<html><head><meta charset="utf-8" /></head><body><table><tr><th>DNI</th><th>Monto</th><th>Referencia</th><th>Pagado</th><th>Estado</th></tr><tr><td>12345678</td><td>1500</td><td style="mso-number-format:'@'">${code}</td><td>18/11/26, 4:10 p. m.</td><td>Pagado</td></tr></table></body></html>`;
    const bytes = new TextEncoder().encode(html);
    const rows = await readExcelRowsFromFile({name:"safetypay.xls",arrayBuffer:async()=>bytes.buffer} as File, "safetypay");
    expect(rows[0]).toMatchObject({codigo_operacion:code,monto:"1500",fecha_pago:"2026-11-18 16:10:00"});
});

it("conserva el texto y el formato numérico de operación en XLSX SafetyPay", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["DNI","Monto","Referencia","Pagado","Estado"],["12345678",1500,"0126321177805405","18/11/26, 4:10 p. m.","Pagado"],["12345678",1500,126321177805405,"18/11/26, 4:10 p. m.","Pagado"]]);
    sheet.C3.z="0000000000000000";
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Operaciones");
    const bytes=XLSX.write(book,{type:"array",bookType:"xlsx"});
    const rows=await readExcelRowsFromFile({name:"safetypay.xlsx",arrayBuffer:async()=>bytes} as File,"safetypay");
    expect(rows.map(r=>r.codigo_operacion)).toEqual(["0126321177805405","0126321177805405"]);
});

it("SafetyPay usa Referencia aunque también existan Operación e Id. de operación", () => {
    const rows=mapExcelRows([["DNI","Monto","Operación","Id. de operación","Referencia","Pagado","Estado"],["12345678",1500,"0126321177805405","999999","00177805","18/11/26, 6:09 p. m.","Pagado"]],"safetypay");
    expect(rows[0].codigo_operacion).toBe("00177805");
});
