/**
 * In-memory todo store, keyed by session ID.
 */

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

const store = new Map<string, Map<string, TodoItem>>();

export function getTodos(sessionId: string): TodoItem[] {
  const items = store.get(sessionId);
  if (!items) return [];
  return Array.from(items.values());
}

export function setTodos(sessionId: string, items: TodoItem[]): void {
  const map = new Map<string, TodoItem>();
  for (const item of items) {
    map.set(item.id, item);
  }
  store.set(sessionId, map);
}

export function clearTodos(sessionId: string): void {
  store.delete(sessionId);
}
