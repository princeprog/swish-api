import { isManagerEditableStaffRole, normalizeStaffRole } from './team-staff-contact-policy';

describe('team staff contact policy', () => {
  it('normalizes role labels into stable role codes', () => {
    expect(normalizeStaffRole('Head Coach')).toBe('head_coach');
    expect(normalizeStaffRole('team-manager')).toBe('team_manager');
  });

  it('allows team managers to save basketball staff roles for their assigned team', () => {
    expect(isManagerEditableStaffRole('head_coach')).toBe(true);
    expect(isManagerEditableStaffRole('coach')).toBe(true);
    expect(isManagerEditableStaffRole('team_manager')).toBe(true);
    expect(isManagerEditableStaffRole('assistant_coach')).toBe(true);
    expect(isManagerEditableStaffRole('trainer')).toBe(true);
    expect(isManagerEditableStaffRole('')).toBe(false);
  });
});
