export type DemoRoute = "bcp" | "bbva" | "scotiabank" | "banbif" | "interbank" | "safetypay";

export type DemoFamily = "all" | "efectivizacion" | "pago-deuda" | "movimientos" | "directo";

export interface DemoAccountProfile {
    id: string;
    route: DemoRoute;
    bank: string;
    company: string;
    account: string;
    baseRevenue: number;
    baseOperations: number;
    efficiency: number;
    expenseRate: number;
    gainRate: number;
    baseIncome: number;
    baseBalance: number;
    basePending: number;
}

export interface DemoMetricRow extends DemoAccountProfile {
    month: string;
    monthIndex: number;
    revenue: number;
    outputs: number;
    expenses: number;
    gains: number;
    income: number;
    balance: number;
    pendingAmount: number;
    operations: number;
    paid: number;
    pending: number;
}

export const demoMonths = ["Mar", "Abr", "May", "Jun", "Jul", "Ago"] as const;

export const routeOptions = [
    { label: "Todos los bancos", value: "all" },
    { label: "BCP", value: "bcp" },
    { label: "BBVA", value: "bbva" },
    { label: "Scotiabank", value: "scotiabank" },
    { label: "BanBif", value: "banbif" },
    { label: "Interbank", value: "interbank" },
    { label: "SafetyPay", value: "safetypay" },
];

export const periodOptions = [
    { label: "Últimos 6 meses", value: "6m" },
    { label: "Últimos 3 meses", value: "3m" },
    { label: "Este mes", value: "month" },
];

export const familyOptions = [
    { label: "Todos los Servicios", value: "all" },
    { label: "Efectivización", value: "efectivizacion" },
    { label: "Pago Deuda", value: "pago-deuda" },
    { label: "Movimientos", value: "movimientos" },
    { label: "Directo", value: "directo" },
];

export const accountProfiles: DemoAccountProfile[] = [
    { id: "bcp-hueso", route: "bcp", bank: "BCP", company: "Hueso Cash S.A.", account: "BCP", baseRevenue: 215000, baseOperations: 132, efficiency: 0.91, expenseRate: 0.008, gainRate: 0.016, baseIncome: 20500, baseBalance: 48800, basePending: 12600 },
    { id: "bcp-capital", route: "bcp", bank: "BCP", company: "Capital Nova S.A.", account: "BCP", baseRevenue: 82000, baseOperations: 58, efficiency: 0.88, expenseRate: 0.009, gainRate: 0.017, baseIncome: 8200, baseBalance: 23400, basePending: 7100 },
    { id: "bbva-fluxopay", route: "bbva", bank: "BBVA", company: "Fluxopay S.A.", account: "BBVA", baseRevenue: 128000, baseOperations: 84, efficiency: 0.93, expenseRate: 0.007, gainRate: 0.018, baseIncome: 11800, baseBalance: 31700, basePending: 5600 },
    { id: "bbva-impulsa", route: "bbva", bank: "BBVA", company: "Impulsa Capital Corp S.A.", account: "BBVA", baseRevenue: 96000, baseOperations: 66, efficiency: 0.86, expenseRate: 0.01, gainRate: 0.017, baseIncome: 7100, baseBalance: 26400, basePending: 9300 },
    { id: "scotia-capital", route: "scotiabank", bank: "Scotiabank", company: "Capital Nova S.A.", account: "Scotiabank", baseRevenue: 155000, baseOperations: 94, efficiency: 0.89, expenseRate: 0.008, gainRate: 0.019, baseIncome: 9200, baseBalance: 35600, basePending: 10500 },
    { id: "scotia-academia", route: "scotiabank", bank: "Scotiabank", company: "Academia WK S.A.", account: "Scotiabank", baseRevenue: 74000, baseOperations: 49, efficiency: 0.84, expenseRate: 0.011, gainRate: 0.018, baseIncome: 4800, baseBalance: 19700, basePending: 8800 },
    { id: "banbif-acuenta", route: "banbif", bank: "BanBif", company: "A Cuenta WK S.A.", account: "BanBif", baseRevenue: 118000, baseOperations: 77, efficiency: 0.92, expenseRate: 0.008, gainRate: 0.02, baseIncome: 6700, baseBalance: 29400, basePending: 6200 },
    { id: "interbank-two1", route: "interbank", bank: "Interbank", company: "TwoService (1) S.A.", account: "Interbank", baseRevenue: 91000, baseOperations: 63, efficiency: 0.9, expenseRate: 0.008, gainRate: 0.017, baseIncome: 5900, baseBalance: 24100, basePending: 7300 },
    { id: "interbank-two2", route: "interbank", bank: "Interbank", company: "TwoService (2) S.A.", account: "Interbank", baseRevenue: 63000, baseOperations: 43, efficiency: 0.87, expenseRate: 0.009, gainRate: 0.017, baseIncome: 3900, baseBalance: 16800, basePending: 5900 },
    { id: "safetypay-main", route: "safetypay", bank: "SafetyPay", company: "SafetyPay", account: "Interbank", baseRevenue: 141000, baseOperations: 96, efficiency: 0.94, expenseRate: 0.015, gainRate: 0.006, baseIncome: 0, baseBalance: 22100, basePending: 4100 },
];

const monthFactors = [0.82, 0.9, 0.97, 1.02, 1.13, 1.08];

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const demoMetricRows: DemoMetricRow[] = accountProfiles.flatMap((profile, profileIndex) =>
    demoMonths.map((month, monthIndex) => {
        const accountFactor = 0.96 + ((profileIndex * 7 + monthIndex * 3) % 9) / 100;
        const factor = monthFactors[monthIndex] * accountFactor;
        const revenue = roundMoney(profile.baseRevenue * factor);
        const operations = Math.round(profile.baseOperations * factor);
        const paid = Math.min(operations, Math.round(operations * profile.efficiency));
        const pending = operations - paid;
        const expenses = roundMoney(revenue * profile.expenseRate);
        const gains = roundMoney(revenue * profile.gainRate);
        const outputs = roundMoney(revenue - gains + expenses);

        return {
            ...profile,
            month,
            monthIndex,
            revenue,
            outputs,
            expenses,
            gains,
            income: roundMoney(profile.baseIncome * factor),
            balance: roundMoney(profile.baseBalance * (0.9 + monthIndex * 0.035) * accountFactor),
            pendingAmount: roundMoney(profile.basePending * (1.08 - monthIndex * 0.035) * accountFactor),
            operations,
            paid,
            pending,
        };
    }),
);

export const familyFactors: Record<DemoFamily, { revenue: number; outputs: number; gains: number; expenses: number; income: number; operations: number }> = {
    all: { revenue: 1, outputs: 1, gains: 1, expenses: 1, income: 1, operations: 1 },
    efectivizacion: { revenue: 0.68, outputs: 0.7, gains: 0.74, expenses: 0.72, income: 0, operations: 0.62 },
    "pago-deuda": { revenue: 0.22, outputs: 0.2, gains: 0.2, expenses: 0.23, income: 0, operations: 0.24 },
    movimientos: { revenue: 0, outputs: 0.1, gains: 0.06, expenses: 0.05, income: 1, operations: 0.09 },
    directo: { revenue: 0, outputs: 0, gains: 0, expenses: 0, income: 0, operations: 0.05 },
};

export const safetyPayDerivedCompanies = [
    { company: "TwoService (1) S.A.", account: "Interbank", operations: 31, transfer: 48650 },
    { company: "A Cuenta WK S.A.", account: "BanBif", operations: 24, transfer: 37200 },
    { company: "Capital Nova S.A.", account: "BCP", operations: 19, transfer: 29180 },
];
