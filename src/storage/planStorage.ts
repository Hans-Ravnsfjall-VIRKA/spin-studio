import type { PlanTemplate } from '../models/planImportModel';

const KEY = 'spin-studio.plans.v1';

export function loadPlans(): PlanTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PlanTemplate[]).filter((p) => p && Array.isArray(p.items)) : [];
  } catch {
    return [];
  }
}

export function savePlans(plans: PlanTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    /* storage full or blocked: the plan still works until the page closes */
  }
}
