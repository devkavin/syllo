import React from "react";
import { Link } from "react-router-dom";
import { formatStudyTime } from "@/lib/studyTime";
export default function AgendaList({ items = [], timezone, withDate = false }) {
  if (!items.length) return <p className="py-4 text-sm text-muted-foreground">Nothing scheduled. Leave room for a focus session, or plan some study time.</p>;
  return <ol className="divide-y divide-border">{items.map(item => <li key={`${item.source || "agenda"}-${item.id}`}>
    <Link to={item.href || "/planner"} className="flex gap-4 py-4 items-start hover:text-primary">
      <time dateTime={item.starts_at} className="text-sm text-muted-foreground shrink-0 min-w-20">{formatStudyTime(item.starts_at, timezone, withDate)}</time>
      <div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground mt-1">{item.kind.replaceAll("_", " ")}{item.ends_at && ` · until ${formatStudyTime(item.ends_at, timezone)}`}</p></div>
    </Link>
  </li>)}</ol>;
}
