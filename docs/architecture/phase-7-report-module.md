# Phase 7 - Report Module

## Summary

Phase 7 adds deterministic report generation for the V1 `ComparisonResult` shape.
The module does not re-run pricing logic; every export is produced from the exact
comparison object passed to the generator.

## Components

- `PdfReportGenerator` creates a compact PDF report with comparison metadata,
  provider totals, line items, and warnings.
- `CsvReportGenerator` creates line-oriented CSV data for spreadsheet import.
- `ExcelReportGenerator` creates a real `.xlsx` OpenXML package with workbook,
  worksheet, relationships, content types, styles, and formatted column widths.
- `ReportService` dispatches by `pdf`, `csv`, or `xlsx` and returns filename,
  content type, and binary content for the future API export endpoint.

## Security

CSV and Excel exports apply formula-injection mitigation from `11-SECURITY.md`.
User-influenced text beginning with `=`, `+`, `-`, `@`, tab, carriage return, or
newline is prefixed with a single quote before being written.

PDF output escapes interpolated text for PDF literal strings, including backslashes,
parentheses, and control whitespace.

## Implementation Notes

The report module does not add runtime dependencies. The XLSX generator uses a small
internal no-compression ZIP writer with CRC32 support, enough for deterministic
OpenXML package creation. The PDF generator writes a simple PDF object graph directly
with deterministic page content and cross-reference offsets.

## Verification

- `npm run test:unit --workspace @polycost/api -- --runInBand src/reports`
- `npm run ci:unit`
- `npm run ci:lint`
- `npm run ci:build`
- `npm run ci:integration`
- `npm run ci:e2e`
- `npm run ci:security`
- `npm run security:scan`
- `npm run check`
- Docker Compose rebuild/start with API `/health` and web HTTP smoke checks
- Source scan for direct `process.env`
- Source scan for `dangerouslySetInnerHTML`, `eval`, and `new Function`

Coverage after Phase 7:

- API overall: 98.18% statements, 90.79% branches, 96.36% functions, 98.63% lines.
- Reports package: 99.57% statements, 92.85% branches, 100% functions, 99.54% lines.
- `PdfReportGenerator`: 100% statements, branches, functions, and lines.
