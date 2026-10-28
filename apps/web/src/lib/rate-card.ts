import { useEffect, useState } from 'react';
import type { PolyCostClient } from '../api-client';
import type { ModeledRateCard } from '../types';

/*
  ADR-0002 (audit H-10): modeled rates - app platforms, functions, ARM ratios,
  regional premiums - come only from the API's rate card. Until it loads, or if
  it cannot be loaded, the figures built on them are not shown; there is no
  bundled copy to fall back to, because a stale copy is what the audit found.
*/

const cache = new WeakMap<PolyCostClient, Promise<ModeledRateCard | null>>();

export function loadModeledRateCard(client: PolyCostClient): Promise<ModeledRateCard | null> {
  let pending = cache.get(client);
  if (!pending) {
    pending = client.getRateCard().catch(() => {
      // Let a later render retry instead of caching the failure for good.
      cache.delete(client);
      return null;
    });
    cache.set(client, pending);
  }
  return pending;
}

export function useModeledRateCard(client: PolyCostClient): ModeledRateCard | null {
  const [card, setCard] = useState<ModeledRateCard | null>(null);

  useEffect(() => {
    let live = true;
    void loadModeledRateCard(client).then((loaded) => {
      if (live) setCard(loaded);
    });
    return () => {
      live = false;
    };
  }, [client]);

  return card;
}
