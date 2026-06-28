export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface GeneratedReport {
  fileName: string;
  contentType: string;
  content: Buffer;
}
