export function normalizeStaffRole(role: string | null | undefined) {
  return String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isManagerEditableStaffRole(role: string | null | undefined) {
  return normalizeStaffRole(role).length > 0;
}
