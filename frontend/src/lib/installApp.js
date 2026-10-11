let prompt;
let registration;
const listeners = new Set();
let state = { installable: false, installed: false, ready: false, error: "" };
const publish = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
export const installApp = {
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => state,
  async install() {
    if (!prompt) return;
    const current = prompt;
    prompt = null;
    publish({ installable: false });
    await current.prompt();
    const result = await current.userChoice;
    if (result.outcome === "accepted") publish({ installed: true });
  },
};
export function registerOfflineApp() {
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); prompt = event; publish({ installable: true }); });
  window.addEventListener("appinstalled", () => { prompt = null; publish({ installed: true, installable: false }); });
  if (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone) publish({ installed: true });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      publish({ ready: true });
    } catch { publish({ error: "Offline app could not be prepared. Reload while connected to try again." }); }
  };
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", register, { once: true });
}
