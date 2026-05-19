export class CreateRequiredRoleDto {
  role!: string;
  label!: string;
  is_required?: boolean;
  sort_order?: number;
  division_id?: number | null;
}
