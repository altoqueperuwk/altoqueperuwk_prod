import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OperationTable } from "./operation-table";

const rows = [{id:1,name:"Operación A"},{id:2,name:"Operación B"}];
function SelectionTable() {
    const [selectedIds,setSelectedIds]=useState<number[]>([]);
    return <OperationTable columns={[{key:"name",label:"Operación"}]} data={rows} emptyText="Sin filas" hidePagination virtualizeRows
        selectedIds={selectedIds}
        onToggleRow={id=>setSelectedIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
        onToggleRows={(ids,selected)=>setSelectedIds(current=>selected?[...new Set([...current,...ids])]:current.filter(id=>!ids.includes(id)))}
        renderActions={()=> <button type="button">Ver detalle</button>} />;
}
afterEach(()=>{cleanup();document.documentElement.classList.remove("dark-mode");});
const row=(id:number)=>screen.getByRole("checkbox",{name:`Seleccionar ${id}`}).closest("tr")!;
const isRowSelected=(element:Element)=>element.getAttribute("data-operation-selected")==="true";

describe.each([false,true])("selección y neón (oscuro=%s)",dark=>{
    beforeEach(()=>{document.documentElement.classList.toggle("dark-mode",dark);});
    it("desmarca la fila aunque el checkbox conserve el foco",()=>{
        render(<SelectionTable/>);const checkbox=screen.getByRole("checkbox",{name:"Seleccionar 1"});
        act(()=>checkbox.focus());fireEvent.click(checkbox);expect(checkbox).toBeChecked();expect(isRowSelected(row(1))).toBe(true);
        fireEvent.click(checkbox);expect(checkbox).not.toBeChecked();expect(checkbox).toHaveFocus();
        expect(row(1)).not.toHaveAttribute("data-operation-selected");expect(isRowSelected(row(1))).toBe(false);
    });
    it("selecciona y deselecciona al pulsar la fila sin alterar otra selección",()=>{
        render(<SelectionTable/>);fireEvent.click(screen.getByText("Operación B"));
        fireEvent.click(screen.getByText("Operación A"));fireEvent.click(screen.getByText("Operación A"));
        expect(row(1)).not.toHaveAttribute("data-operation-selected");expect(isRowSelected(row(1))).toBe(false);
        expect(row(2)).toHaveAttribute("data-operation-selected","true");expect(isRowSelected(row(2))).toBe(true);
    });
    it("selecciona y desmarca todas sin dejar filas seleccionadas",()=>{
        render(<SelectionTable/>);const all=screen.getByRole("checkbox",{name:"Seleccionar pagina"});
        fireEvent.click(all);expect(isRowSelected(row(1))).toBe(true);expect(isRowSelected(row(2))).toBe(true);
        fireEvent.click(all);expect(isRowSelected(row(1))).toBe(false);expect(isRowSelected(row(2))).toBe(false);
    });
    it("enfocar una acción no selecciona la fila",()=>{
        render(<SelectionTable/>);screen.getAllByRole("button",{name:"Ver detalle"})[0].focus();
        expect(row(1)).not.toHaveAttribute("data-operation-selected");expect(isRowSelected(row(1))).toBe(false);
    });
});
