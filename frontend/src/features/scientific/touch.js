const middle = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
const distance = points => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);

export function pinchView(view, start, current) {
  const before = middle(start), after = middle(current);
  const zoom = Math.max(0.1, Math.min(4, view.zoom * distance(current) / Math.max(1, distance(start))));
  return { zoom, x: after.x - (before.x - view.x) * zoom / view.zoom, y: after.y - (before.y - view.y) * zoom / view.zoom };
}
