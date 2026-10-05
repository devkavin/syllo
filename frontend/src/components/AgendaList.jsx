import React from "react";
import { Link } from "react-router-dom";
import { formatStudyTime } from "@/lib/studyTime";
export default function AgendaList({ items = [], timezone, withDate = false }) {
  if (!items.length) return <p className="py-4 text-sm text-muted-foreground">Nothing scheduled. Leave room for a focus session, or plan some study time.</p>;
  return <ol className="divide-y divide-border">{items.map(item => <li key={`${item.source || "agenda"}-${item.id}`}>
    <Link to={item.href || "/planner"} className="flex flex-col sm:flex-row gap-1 sm:gap-5 p-3 -mx-3 rounded-lg hover:bg-accent/50">
      <time dateTime={item.starts_at} className="text-sm text-muted-foreground shrink-0 sm:w-36">{formatStudyTime(item.starts_at, timezone, withDate)}</time>
      <div className="min-w-0"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground mt-1">{item.kind.replaceAll("_", " ")}{item.ends_at && ` · until ${formatStudyTime(item.ends_at, timezone)}`}</p></div>
    </Link>
  </li>)}</ol>;
}
