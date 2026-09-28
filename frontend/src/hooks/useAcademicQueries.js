import { useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const get = (url) => async () => (await http.get(url)).data;

export function useSubjectsQuery(options = {}) {
  return useQuery({ queryKey: queryKeys.subjects, queryFn: get("/subjects"), ...options });
}

export function useTodayQuery(options = {}) {
  return useQuery({ queryKey: queryKeys.today, queryFn: get("/today"), ...options });
}

export function useTasksQuery(options = {}) {
  return useQuery({ queryKey: queryKeys.tasks, queryFn: get("/tasks"), ...options });
}

export function useAcademicInvalidation() {
  const client = useQueryClient();
  return {
    subjects: () => client.invalidateQueries({ queryKey: queryKeys.subjects }),
    today: () => client.invalidateQueries({ queryKey: queryKeys.today }),
    tasks: () => client.invalidateQueries({ queryKey: queryKeys.tasks }),
    progress: () => client.invalidateQueries({ queryKey: queryKeys.analytics }),
  };
}
