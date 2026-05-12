export const EUROVISION_POINTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12] as const;

export function normalizeEurovisionPoints(value: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;

  let nearest: number = EUROVISION_POINTS[0];
  let nearestDistance = Math.abs(numericValue - nearest);

  for (const point of EUROVISION_POINTS) {
    const distance = Math.abs(numericValue - point);
    if (distance < nearestDistance || (distance === nearestDistance && point > nearest)) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest;
}

