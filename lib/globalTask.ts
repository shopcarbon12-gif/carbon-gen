type TaskTone = "running" | "success" | "error" | "idle";

export type GlobalTask = {
  id: string;
  label: string;
  tone: TaskTone;
  meta?: string;
  ts: number;
};

const STORAGE_KEY = "carbon_global_tasks";
export const GLOBAL_TASKS_EVENT = "carbon_global_task_update";

export function setGlobalTask(
  id: string,
  label: string,
  tone: TaskTone,
  meta?: string,
) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const tasks: GlobalTask[] = raw ? JSON.parse(raw) : [];
    const task: GlobalTask = { id, label, tone, meta: meta || "", ts: Date.now() };
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx >= 0) tasks[idx] = task;
    else tasks.push(task);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new Event(GLOBAL_TASKS_EVENT));
  } catch {}
}

export function updateGlobalTaskMeta(id: string, meta: string) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const tasks: GlobalTask[] = JSON.parse(raw);
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.meta = meta;
      task.ts = Date.now();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      window.dispatchEvent(new Event(GLOBAL_TASKS_EVENT));
    }
  } catch {}
}

export function removeGlobalTask(id: string) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const tasks: GlobalTask[] = JSON.parse(raw).filter(
      (t: GlobalTask) => t.id !== id,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new Event(GLOBAL_TASKS_EVENT));
  } catch {}
}

export function readGlobalTasks(): GlobalTask[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const tasks: GlobalTask[] = JSON.parse(raw);
    const now = Date.now();
    const alive = tasks.filter(
      (t) => t.tone === "running" || now - t.ts < 8000,
    );
    if (alive.length !== tasks.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alive));
    }
    return alive;
  } catch {
    return [];
  }
}
