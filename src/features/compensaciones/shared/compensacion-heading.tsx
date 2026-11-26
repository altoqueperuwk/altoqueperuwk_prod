type CompensacionSection = "resumen" | "colaboradores" | "evidencias" | "incidencias" | "bonos-mes" | "configuracion" | "reportes";

/** Encabezado compacto con orientación breve siempre visible. */
export const CompensacionHeading = ({ section, title, description }: { section: CompensacionSection; title: string; description?: string }) => {
    return (
        <header className="min-w-0" data-section={section}>
            <h1 className="text-xl font-semibold text-primary">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-secondary">{description}</p>}
        </header>
    );
};
