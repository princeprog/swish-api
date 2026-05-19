export class UpsertComplianceStatusDto {
  item_id!: number;
  status!: 'pending' | 'complete';
  notes?: string | null;
  attachments?: any;
  meta?: any;
}

