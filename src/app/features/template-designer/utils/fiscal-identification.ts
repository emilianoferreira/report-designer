import { FiscalRole } from '../../../core/models/fiscal.model';

/** Logical grouping only: this map imposes no printed position or physical section. */
export type FiscalZone = 'issuer' | 'document' | 'recipient' | 'body' | 'fiscal-footer' | 'adenda';
export function fiscalZones(roles: readonly string[]): FiscalZone[] {
  const zones = roles.flatMap(role => {
    const prefix = role.split('.')[0];
    if (prefix === 'issuer' || prefix === 'recipient' || prefix === 'adenda') return [prefix as FiscalZone];
    if (role === 'document.date') return ['body' as const];
    if (prefix === 'document') return ['document' as const];
    if (prefix === 'security' || prefix === 'footer') return ['fiscal-footer' as const];
    if (['detail', 'totals', 'adjustments', 'tax', 'reference', 'payment'].includes(prefix)) return ['body' as const];
    return [];
  });
  return [...new Set(zones)];
}

/** Exact renderer contracts only; ambiguous amounts and free text have no mapping. */
export const GENERATED_DETAIL_ROLES: Record<string, FiscalRole[]> = {
  'Articulo.Nombre': ['detail.description'], Cantidad: ['detail.quantity'],
  PrecioUnitario: ['detail.unit-price'], PrecioUnitarioNeto: ['detail.unit-price'],
  SubTotal: ['detail.amount']
};
