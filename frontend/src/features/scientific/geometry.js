export function boundsOf(objects) {
  if (!objects.length) return { x: 0, y: 0, width: 1, height: 1 };
  const corners = objects.flatMap(obj => {
    const a = obj.rotation * Math.PI / 180, cx = obj.x + obj.width / 2, cy = obj.y + obj.height / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: cx + sx * obj.width / 2 * Math.cos(a) - sy * obj.height / 2 * Math.sin(a), y: cy + sx * obj.width / 2 * Math.sin(a) + sy * obj.height / 2 * Math.cos(a) }));
  });
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
  return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
}

export function selectionUnits(objects) {
  const groups = new Map();
  for (const obj of objects) { const key = obj.groupId || obj.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(obj); }
  return [...groups.values()].map(members => ({ members, box: boundsOf(members) }));
}
