import { http } from "@/lib/api";

const PATH = "/illustrations/library";

export async function getLibrary(options = {}) {
  const { data } = await http.get(PATH, { timeout: 15000, ...options });
  return data;
}

export async function patchLibrary(command, expectedRevision, options = {}) {
  const { data } = await http.patch(PATH, {
    ...command, expected_revision: expectedRevision,
  }, { timeout: 15000, ...options });
  return data;
}
