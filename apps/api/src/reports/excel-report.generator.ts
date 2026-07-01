import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import {
  commitmentTcoRows,
  decisionSummaryRows,
  egressTierBreakdownRows,
  lineItemEvidenceRows,
  pricingModelAvailabilityRows,
  providerRankingRows,
  reportAssumptionRows,
  reportContextRows,
  selectedScenarioRows,
  serviceRequirementRows,
  workloadScopeRows,
} from './report-evidence';
import { buildReportInsights } from './report-insights';
import { escapeXml, sanitizeSpreadsheetText } from './report-security';
import { ReportOptions } from './report.types';
import { createZip } from './zip-writer';

type CellValue = string | number;

interface WorksheetRow {
  cells: CellValue[];
  style?: number;
}

@Injectable()
export class ExcelReportGenerator {
  generate(result: ComparisonResult, options: ReportOptions = {}): Buffer {
    const rows = this.rows(result, options);

    return createZip([
      {
        path: '[Content_Types].xml',
        content: xmlBuffer(contentTypesXml()),
      },
      {
        path: '_rels/.rels',
        content: xmlBuffer(rootRelationshipsXml()),
      },
      {
        path: 'xl/workbook.xml',
        content: xmlBuffer(workbookXml()),
      },
      {
        path: 'xl/_rels/workbook.xml.rels',
        content: xmlBuffer(workbookRelationshipsXml()),
      },
      {
        path: 'xl/styles.xml',
        content: xmlBuffer(stylesXml()),
      },
      {
        path: 'xl/worksheets/sheet1.xml',
        content: xmlBuffer(worksheetXml(rows)),
      },
    ]);
  }

  private rows(result: ComparisonResult, options: ReportOptions): WorksheetRow[] {
    const rows: WorksheetRow[] = [
      {
        cells: ['PolyCost Comparison Report'],
        style: 1,
      },
      {
        cells: ['Comparison ID', sanitizeSpreadsheetText(result.comparisonId)],
      },
      {
        cells: ['Pricing As Of', sanitizeSpreadsheetText(result.pricingAsOf)],
      },
      {
        cells: ['Cheapest provider (on-demand baseline)', result.cheapestProviderId],
      },
      ...reportContextRows(options).map((row) => ({
        cells: row,
      })),
      {
        cells: [],
      },
      {
        cells: ['Decision Summary'],
        style: 2,
      },
      ...decisionSummaryRows(result, options).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Provider Ranking'],
        style: 2,
      },
      ...providerRankingRows(result, options).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Workload Scope'],
        style: 2,
      },
      ...workloadScopeRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['FinOps Summary'],
        style: 2,
      },
      {
        cells: ['Metric', 'Value'],
        style: 2,
      },
      ...buildReportInsights(result).map((insight) => ({
        cells: [insight.label, sanitizeSpreadsheetText(insight.value)],
      })),
      {
        cells: [],
      },
      {
        cells: ['Provider Totals'],
        style: 2,
      },
      {
        cells: ['Provider', 'Daily USD', 'Weekly USD', 'Monthly USD', 'Quarterly USD', 'Yearly USD'],
        style: 2,
      },
      ...result.providers.map((provider) => ({
        cells: [
          provider.providerId,
          provider.totals.daily,
          provider.totals.weekly,
          provider.totals.monthly,
          provider.totals.quarterly,
          provider.totals.yearly,
        ],
      })),
      {
        cells: [],
      },
      {
        cells: ['Selected Pricing Scenario'],
        style: 2,
      },
      ...selectedScenarioRows(result, options).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Pricing Model Availability'],
        style: 2,
      },
      ...pricingModelAvailabilityRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Commitment Payment and TCO'],
        style: 2,
      },
      ...commitmentTcoRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Egress Tiered Breakdown'],
        style: 2,
      },
      ...egressTierBreakdownRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Normalized Service Requirements'],
        style: 2,
      },
      ...serviceRequirementRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Line Items'],
        style: 2,
      },
      {
        cells: ['Provider', 'Category', 'Description', 'Approximate', 'Monthly USD'],
        style: 2,
      },
      ...result.providers.flatMap((provider) =>
        provider.lineItems.map((lineItem) => ({
          cells: [
            provider.providerId,
            lineItem.category,
            sanitizeSpreadsheetText(lineItem.description),
            lineItem.isApproximate ? 'yes' : 'no',
            lineItem.baseMonthlyCostUsd,
          ],
        })),
      ),
      {
        cells: [],
      },
      {
        cells: ['Rate Math Evidence'],
        style: 2,
      },
      ...lineItemEvidenceRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
      {
        cells: [],
      },
      {
        cells: ['Report Assumptions'],
        style: 2,
      },
      ...reportAssumptionRows(result).map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
    ];

    if (result.warnings && result.warnings.length > 0) {
      rows.push(
        {
          cells: [],
        },
        {
          cells: ['Warnings'],
          style: 2,
        },
        {
          cells: ['Provider', 'Code', 'Message'],
          style: 2,
        },
        ...result.warnings.map((warning) => ({
          cells: [
            warning.providerId ?? '',
            warning.code,
            sanitizeSpreadsheetText(warning.message),
          ],
        })),
      );
    }

    return rows;
  }
}

function worksheetXml(rows: WorksheetRow[]): string {
  return xmlDocument(`
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <cols>
        <col min="1" max="1" width="18" customWidth="1"/>
        <col min="2" max="2" width="28" customWidth="1"/>
        <col min="3" max="3" width="42" customWidth="1"/>
        <col min="4" max="10" width="18" customWidth="1"/>
      </cols>
      <sheetData>
        ${rows.map((row, rowIndex) => rowXml(row, rowIndex + 1)).join('')}
      </sheetData>
    </worksheet>
  `);
}

function rowXml(row: WorksheetRow, rowIndex: number): string {
  return `<row r="${rowIndex}">${row.cells
    .map((cell, cellIndex) => cellXml(cell, rowIndex, cellIndex + 1, row.style))
    .join('')}</row>`;
}

function cellXml(value: CellValue, rowIndex: number, columnIndex: number, style?: number): string {
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  const styleAttribute = style !== undefined ? ` s="${style}"` : '';

  if (typeof value === 'number') {
    return `<c r="${ref}"${styleAttribute}><v>${value}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"${styleAttribute}><is><t>${escapeXml(value)}</t></is></c>`;
}

function columnName(columnIndex: number): string {
  let value = columnIndex;
  let name = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function contentTypesXml(): string {
  return xmlDocument(`
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    </Types>
  `);
}

function rootRelationshipsXml(): string {
  return xmlDocument(`
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>
  `);
}

function workbookXml(): string {
  return xmlDocument(`
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        <sheet name="Comparison" sheetId="1" r:id="rId1"/>
      </sheets>
    </workbook>
  `);
}

function workbookRelationshipsXml(): string {
  return xmlDocument(`
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>
  `);
}

function stylesXml(): string {
  return xmlDocument(`
    <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="2">
        <font><sz val="11"/><name val="Calibri"/></font>
        <font><b/><sz val="14"/><name val="Calibri"/></font>
      </fonts>
      <fills count="2">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
      </fills>
      <borders count="1"><border/></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="3">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
        <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>
  `);
}

function xmlDocument(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body
    .trim()
    .replace(/\n\s*/g, '')}`;
}

function xmlBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}
