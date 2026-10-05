export function nextStudyAction({ now = new Date(), today = now.toISOString().slice(0, 10), agenda = [], reviews = [], tasks = [] }) {
  const scheduled = agenda.filter(item => item.ends_at).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const current = scheduled.find(item => new Date(item.starts_at) <= now && new Date(item.ends_at) > now);
  if (current) return { label: current.title, href: current.href, kind: "current" };
  const upcoming = scheduled.find(item => new Date(item.starts_at) > now);
  if (upcoming) return { label: upcoming.title, href: upcoming.href, kind: "upcoming" };
  const review = reviews.find(item => new Date(item.next_review_at) <= now);
  if (review) return { label: `Review ${review.lesson_title || "your lesson"}`, href: review.lesson_id ? `/lessons/${review.lesson_id}` : "/reviews", kind: "review" };
  const task = tasks.find(item => !item.completed && item.due_date && item.due_date <= today);
  if (task) return { label: task.title, href: `/tasks?task=${task.task_id}`, kind: "task" };
  return { label: "Choose something to study", href: "/timer", kind: "focus" };
}
