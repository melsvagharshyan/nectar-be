/** Company kind owned by each self-service broker role. */
export const COMPANY_KIND = { broker: 'rf', partner: 'am' } as const;

/** Prefix of generated company ids, e.g. `RF-123`. */
export const COMPANY_PREFIX = { rf: 'RF', am: 'AM' } as const;
