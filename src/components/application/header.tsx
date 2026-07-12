import { Breadcrumb } from "./breadcrumb";

export const Header = () => {
    return (
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-secondary bg-primary px-6">
            <Breadcrumb />
        </header>
    );
};
