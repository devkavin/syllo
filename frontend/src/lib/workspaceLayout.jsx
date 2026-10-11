import { createContext, useContext, useState } from "react";

export const WorkspaceLayoutContext = createContext(null);

// The fallback also supports the notebook when rendered outside the app shell.
export function useNotebookLayout() {
  const layout = useContext(WorkspaceLayoutContext);
  const [expanded, setExpanded] = useState(false);
  return layout || { expanded, setExpanded };
}
