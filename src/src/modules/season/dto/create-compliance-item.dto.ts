export class CreateComplianceItemDto {
  key!: string;
  label!: string;
  category!: string;
  is_required?: boolean;
  sort_order?: number;
  division_id?: number | null;
  config?: any;
}
