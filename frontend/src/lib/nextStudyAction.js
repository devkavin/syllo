export function nextStudyAction({ now = new Date(Date.now()), today = now.toISOString().slice(0, 10), agenda = [], reviews = [], tasks = [] }) {
  const scheduled = agenda.filter(item => item.ends_at).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const current = scheduled.find(item => new Date(item.starts_at) <= now && new Date(item.ends_at) > now);
  if (current) return { label: current.title, href: current.href, kind: "current", item: current };
  const dueTasks = tasks.filter(item => !item.completed && item.due_date && item.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.due_time || "23:59").localeCompare(b.due_time || "23:59"));
  const taskAction = task => ({ label: task.title, href: `/tasks?task=${task.task_id}`, kind: "task", item: task });
  const overdue = dueTasks.find(item => item.due_date < today);
  if (overdue) return taskAction(overdue);
  const review = reviews.filter(item => new Date(item.next_review_at) <= now)
    .sort((a, b) => new Date(a.next_review_at) - new Date(b.next_review_at))[0];
  if (review) return { label: review.lesson_title || review.title || "Review lesson", href: review.lesson_id ? `/lessons/${review.lesson_id}` : "/reviews", kind: "review", item: review };
  if (dueTasks.length) return taskAction(dueTasks[0]);
  const upcoming = scheduled.find(item => new Date(item.starts_at) > now);
  if (upcoming) return { label: upcoming.title, href: upcoming.href, kind: "upcoming", item: upcoming };
  return { label: "Choose something to study", href: "/timer", kind: "focus" };
}
