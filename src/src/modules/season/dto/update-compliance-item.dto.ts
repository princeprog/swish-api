export class UpdateComplianceItemDto {
  division_id?: number | null;
  key?: string;
  label?: string;
  category?: string;
  is_required?: boolean;
  sort_order?: number;
  config?: any;
}
