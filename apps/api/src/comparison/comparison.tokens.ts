export const COMPARISON_PROVIDER_ADAPTERS = Symbol('COMPARISON_PROVIDER_ADAPTERS');
export const COMPARISON_ID_FACTORY = Symbol('COMPARISON_ID_FACTORY');
export const COMPARISON_CLOCK = Symbol('COMPARISON_CLOCK');

export type ComparisonIdFactory = () => string;
export type ComparisonClock = () => Date;
