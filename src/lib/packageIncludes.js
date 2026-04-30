// Package Includes loader (v3.5.31)
//
// Fetches package_includes for a given package_id and joins each row with
// the latest product details. Returns an array shaped for direct use by
// calcQuote() and calcLocationMRR() in pricing.js.
//
// Each returned item contains everything needed to display the include and
// compute its cost contribution — including a snapshot of product fields so
// the caller can persist the result into a saved quote without needing to
// re-fetch.

import { supabase } from './supabase';

/**
 * Load active package_includes for a package, joined with product details.
 *
 * @param {string} packageId — the package's UUID
 * @returns {Promise<Array<{
 *   id: string, product_id: string, is_mandatory: boolean, sort_order: number,
 *   notes: string|null, product_name: string, category: string|null,
 *   sub_category: string|null, sell_price: number, cost_price: number,
 *   qty_driver: string, cost_qty_driver: string|null,
 *   no_discount: boolean, no_commission: boolean, exclusive_group: string|null
 * }>>}
 *
 * Inactive products are still returned (so a quote in flight doesn't lose
 * data if admin deactivates a product mid-edit). The UI can choose to flag
 * those visually if desired.
 */
export async function loadPackageIncludes(packageId) {
  if (!packageId) return [];
  // Two queries — Supabase's foreign-key embed syntax could do this in one,
  // but explicit joins are easier to debug and don't require RLS-friendly
  // FK relationships set up.
  const { data: incRows, error: incErr } = await supabase
    .from('package_includes')
    .select('*')
    .eq('package_id', packageId)
    .order('sort_order');
  if (incErr) {
    console.error('loadPackageIncludes: include fetch failed', incErr);
    return [];
  }
  if (!incRows || incRows.length === 0) return [];

  const productIds = [...new Set(incRows.map(r => r.product_id))];
  const { data: prodRows, error: prodErr } = await supabase
    .from('products')
    .select('id, name, category, sub_category, sell_price, cost_price, qty_driver, cost_qty_driver, no_discount, no_commission, exclusive_group, active')
    .in('id', productIds);
  if (prodErr) {
    console.error('loadPackageIncludes: product fetch failed', prodErr);
    return [];
  }
  const prodById = Object.fromEntries((prodRows || []).map(p => [p.id, p]));

  return incRows
    .map(inc => {
      const p = prodById[inc.product_id];
      if (!p) {
        console.warn('loadPackageIncludes: product missing for include', inc.id, inc.product_id);
        return null;
      }
      return {
        id:               inc.id,
        product_id:       inc.product_id,
        is_mandatory:     !!inc.is_mandatory,
        sort_order:       inc.sort_order ?? 100,
        notes:            inc.notes || null,
        // Snapshot of product fields at time of fetch
        product_name:     p.name,
        category:         p.category || null,
        sub_category:     p.sub_category || null,
        sell_price:       Number(p.sell_price) || 0,
        cost_price:       Number(p.cost_price) || 0,
        qty_driver:       p.qty_driver,
        cost_qty_driver:  p.cost_qty_driver || null,
        no_discount:      !!p.no_discount,
        no_commission:    !!p.no_commission,
        exclusive_group:  p.exclusive_group || null,
        active:           p.active !== false,
      };
    })
    .filter(Boolean);
}
