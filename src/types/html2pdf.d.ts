declare module "html2pdf.js" {
    interface Html2PdfWorker {
        set(options: Record<string, unknown>): Html2PdfWorker;
        from(source: Element): Html2PdfWorker;
        toPdf(): Html2PdfWorker;
        get(key: "pdf"): Promise<import("jspdf").jsPDF>;
        save(): Promise<void>;
    }

    interface Html2Pdf {
        (): Html2PdfWorker;
    }

    const html2pdf: Html2Pdf;
    export default html2pdf;
}
