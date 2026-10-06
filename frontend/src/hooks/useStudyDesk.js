import { useEffect, useState } from "react";
import { http } from "@/lib/api";

const ENDPOINTS = { subjects: "/subjects", notes: "/notebooks", history: "/sessions?limit=10", timetable: "/timetable" };

function useResource(endpoint) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, failed: false });
  useEffect(() => {
    let live = true;
    setState(old => ({ ...old, loading: true, failed: false }));
    http.get(endpoint).then(({ data }) => { if (live) setState({ data, loading: false, failed: false }); })
      .catch(() => { if (live) setState(old => ({ ...old, loading: false, failed: true })); });
    return () => { live = false; };
  }, [endpoint, version]);
  return { ...state, retry: () => setVersion(n => n + 1) };
}

// Optional desk context is independent of today's request and task mutations.
// /notebooks returns summaries: note bodies are fetched only in the editor.
export default function useStudyDesk() {
  const subjects = useResource(ENDPOINTS.subjects);
  const notes = useResource(ENDPOINTS.notes);
  const history = useResource(ENDPOINTS.history);
  const timetable = useResource(ENDPOINTS.timetable);
  const [lesson, setLesson] = useState(null);
  const [lessonFailed, setLessonFailed] = useState(false);
  const recentId = history.data?.find(s => s.lesson_id && s.duration_seconds > 0 && !["short", "long"].includes(s.mode))?.lesson_id;
  useEffect(() => {
    let live = true;
    setLesson(null); setLessonFailed(false);
    if (recentId) http.get(`/lessons/${encodeURIComponent(recentId)}`).then(({ data }) => { if (live) setLesson(data); })
      .catch(error => { if (live && error.response?.status !== 404) setLessonFailed(true); });
    return () => { live = false; };
  }, [recentId, history.data]);
  const subjectName = id => subjects.data?.find(s => s.subject_id === id)?.name;
  return { subjects, notes, history, timetable, lesson, lessonFailed, subjectName };
}

export function studyFocusHref(item) {
  if (item?.kind === "circle_study") return `/timer?event=${encodeURIComponent(item.id)}`;
  if (item?.lesson_id) return `/timer?lesson=${encodeURIComponent(item.lesson_id)}`;
  if (item?.subject_id) return `/timer?subject=${encodeURIComponent(item.subject_id)}`;
  return "/timer";
}
