import { useMemo } from 'react';
import { useFarm } from '../context/FarmContext';
import { cropFunnel, treeCrops } from '../lib/crop';
import { useSeasons } from './useSeasons';

/** Every tree's crop this season and the farm-wide funnel, from live data. */
export function useCrops() {
  const { trees, harvestCycles, treeBlooms, cropCounts, harvests } = useFarm();
  const seasons = useSeasons();
  const crops = useMemo(
    () => treeCrops(trees, seasons, harvestCycles, treeBlooms, cropCounts, harvests),
    [trees, seasons, harvestCycles, treeBlooms, cropCounts, harvests]
  );
  const funnel = useMemo(() => cropFunnel(crops, seasons, harvests), [crops, seasons, harvests]);
  return { crops, funnel, seasons };
}
