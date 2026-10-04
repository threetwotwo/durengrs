import { useMemo } from 'react';
import { useFarm } from '../context/FarmContext';
import { blockSeasons } from '../lib/guide';

/** Each block's season from its bloom date plus trees and branches that flowered apart. One place, so every page agrees. */
export function useSeasons() {
  const { trees, variants, harvestCycles, treeBlooms } = useFarm();
  return useMemo(() => blockSeasons(trees, variants, harvestCycles, treeBlooms), [trees, variants, harvestCycles, treeBlooms]);
}
