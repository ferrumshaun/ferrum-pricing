import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const ConfigContext = createContext({});

export function ConfigProvider({ children }) {
  const [packages,     setPackages]     = useState([]);
  const [products,     setProducts]     = useState([]);
  const [marketTiers,  setMarketTiers]  = useState([]);
  const [settings,     setSettings]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  async function loadConfig() {
    setLoading(true);
    try {
      const [pkgs, prods, tiers, setts] = await Promise.all([
        supabase.from('packages').select('*').eq('active', true).order('sort_order'),
        supabase.from('products').select('*').eq('active', true).order('category').order('sort_order'),
        supabase.from('market_tiers').select('*').eq('active', true).order('sort_order'),
        supabase.from('pricing_settings').select('*'),
      ]);
      if (pkgs.error)  throw pkgs.error;
      if (prods.error) throw prods.error;
      if (tiers.error) throw tiers.error;
      if (setts.error) throw setts.error;

      setPackages(pkgs.data || []);
      setProducts(prods.data || []);
      setMarketTiers(tiers.data || []);
      // Convert settings array to key→value map
      const settMap = {};
      for (const s of setts.data || []) settMap[s.key] = s.value;
      setSettings(settMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadConfig(); }, []);

  // Group products by category for UI rendering
  const productsByCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  // Group products by exclusive_group for mutual exclusion logic
  const exclusiveGroups = products.reduce((acc, p) => {
    if (!p.exclusive_group) return acc;
    if (!acc[p.exclusive_group]) acc[p.exclusive_group] = [];
    acc[p.exclusive_group].push(p.id);
    return acc;
  }, {});

  return (
    <ConfigContext.Provider value={{
      packages, products, marketTiers, settings,
      productsByCategory, exclusiveGroups,
      loading, error, reload: loadConfig
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

export const useConfig = () => useContext(ConfigContext);
