import { Injectable } from '@nestjs/common';
import { ComparisonResult } from '../comparison/comparison.types';
import {
  breakEvenSummaryRows,
  commitmentTcoRows,
  decisionSummaryRows,
  egressNetworkingDetailRows,
  egressTierBreakdownRows,
  labelForPricingModel,
  lineItemEvidenceRows,
  optimizationOpportunityRows,
  pricingModelAvailabilityRows,
  providerRankingRows,
  regionComparisonRows,
  reportAssumptionRows,
  reportContextRows,
  selectedScenarioRows,
  serviceRequirementRows,
  workloadScopeRows,
} from './report-evidence';
import { PricingModelCost } from '../adapters/common/cloud-provider-adapter';
import { escapeXml, sanitizeSpreadsheetText } from './report-security';
import { buildReportInsights } from './report-insights';
import { ReportOptions } from './report.types';
import { createZip } from './zip-writer';

type CellValue = string | number | FormulaCell;

interface FormulaCell {
  formula: string;
  value: number;
}

interface WorksheetRow {
  cells: CellValue[];
  style?: number;
}

interface WorkbookDefinition {
  sheets: SheetDefinition[];
  namedRanges: NamedRange[];
}

interface SheetDefinition {
  name: string;
  rows: WorksheetRow[];
}

interface NamedRange {
  name: string;
  reference: string;
}

interface WhatIfSheet {
  rows: WorksheetRow[];
  providerStartRow?: number;
  providerEndRow?: number;
  scaleFactorRow: number;
  regionMultiplierRow: number;
  monthlyDeltaStartRow?: number;
  monthlyDeltaEndRow?: number;
}

interface WhatIfProviderScenario {
  providerId: ComparisonResult['providers'][number]['providerId'];
  baselineMonthlyUsd: number;
}

interface BreakEvenSheet {
  rows: WorksheetRow[];
  onDemandMultiplierRow: number;
}

const DEFAULT_WHAT_IF_SCALE_FACTOR = 1.25;
const DEFAULT_WHAT_IF_REGION_MULTIPLIER = 1;
const DEFAULT_BREAK_EVEN_ON_DEMAND_MULTIPLIER = 1;

@Injectable()
export class ExcelReportGenerator {
  generate(result: ComparisonResult, options: ReportOptions = {}): Buffer {
    const workbook = this.workbook(result, options);
    const worksheetEntries = workbook.sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: xmlBuffer(worksheetXml(sheet.rows)),
    }));

    return createZip([
      {
        path: '[Content_Types].xml',
        content: xmlBuffer(contentTypesXml(workbook.sheets.length)),
      },
      {
        path: '_rels/.rels',
        content: xmlBuffer(rootRelationshipsXml()),
      },
      {
        path: 'xl/workbook.xml',
        content: xmlBuffer(workbookXml(workbook.sheets, workbook.namedRanges)),
      },
      {
        path: 'xl/_rels/workbook.xml.rels',
        content: xmlBuffer(workbookRelationshipsXml(workbook.sheets.length)),
      },
      {
        path: 'xl/styles.xml',
        content: xmlBuffer(stylesXml()),
      },
      ...worksheetEntries,
    ]);
  }

  private workbook(result: ComparisonResult, options: ReportOptions): WorkbookDefinition {
    const comparisonRows = this.rows(result, options);
    const whatIfSheet = whatIfRows(result, options);
    const breakEvenSheet = breakEvenRows(result);
    const namedRanges = namedRangesForWorkbook(
      comparisonRows,
      whatIfSheet,
      breakEvenSheet,
      result.providers.length,
    );

    return {
      sheets: [
        {
          name: 'Comparison',
          rows: comparisonRows,
        },
        {
          name: 'What If',
          rows: whatIfSheet.rows,
        },
        evidenceSheet('Optimization Opportunities', optimizationOpportunityRows(result)),
        evidenceSheet('Egress & Networking Detail', egressNetworkingDetailRows(result)),
        evidenceSheet('Region Comparison', regionComparisonRows(result)),
        {
          name: 'Break-Even Analysis',
          rows: breakEvenSheet.rows,
        },
        evidenceSheet('Break-Even Summary', breakEvenSummaryRows(result)),
      ],
      namedRanges,
    };
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

function whatIfRows(result: ComparisonResult, options: ReportOptions): WhatIfSheet {
  const pricingModel = options.pricingModel ?? 'on-demand';
  const scenarios = result.providers
    .map((provider) => {
      const baselineMonthlyUsd = whatIfBaselineMonthlyCost(provider, pricingModel);

      return baselineMonthlyUsd !== undefined
        ? {
            providerId: provider.providerId,
            baselineMonthlyUsd,
          }
        : undefined;
    })
    .filter((scenario): scenario is WhatIfProviderScenario => scenario !== undefined);
  const rows: WorksheetRow[] = [
    {
      cells: ['PolyCost What-If Model'],
      style: 1,
    },
    {
      cells: [
        'Scenario context',
        'Edit the assumption cells, then recalculate the workbook to model scale and regional sensitivity.',
      ],
    },
    {
      cells: [],
    },
    {
      cells: ['Editable assumption', 'Value', 'How to use'],
      style: 2,
    },
    {
      cells: [
        'Scale factor',
        DEFAULT_WHAT_IF_SCALE_FACTOR,
        '1.25 models a 25% workload increase; change this cell for demand sensitivity.',
      ],
    },
    {
      cells: [
        'Region multiplier',
        DEFAULT_WHAT_IF_REGION_MULTIPLIER,
        'Use 1 unless applying a manual regional price sensitivity adjustment.',
      ],
    },
    {
      cells: [
        'Selected pricing model',
        labelForPricingModel(pricingModel),
        'The baseline uses the pricing model selected when the export was requested.',
      ],
    },
    {
      cells: [],
    },
    {
      cells: ['Provider Scenario Model'],
      style: 2,
    },
    {
      cells: [
        'Provider',
        'Baseline monthly USD',
        'Scale factor',
        'Region multiplier',
        'Scenario monthly USD',
        'Scenario yearly USD',
        'Delta monthly USD',
        'Delta yearly USD',
      ],
      style: 2,
    },
  ];
  const providerStartRow = rows.length + 1;

  rows.push(
    ...scenarios.map((scenario, index) => {
      const rowNumber = providerStartRow + index;
      const scenarioMonthly = roundCurrency(
        scenario.baselineMonthlyUsd * DEFAULT_WHAT_IF_SCALE_FACTOR * DEFAULT_WHAT_IF_REGION_MULTIPLIER,
      );
      const scenarioYearly = roundCurrency(scenarioMonthly * 12);
      const deltaMonthly = roundCurrency(scenarioMonthly - scenario.baselineMonthlyUsd);
      const deltaYearly = roundCurrency(deltaMonthly * 12);

      return {
        cells: [
          sanitizeSpreadsheetText(scenario.providerId),
          scenario.baselineMonthlyUsd,
          formulaCell('WhatIfScaleFactor', DEFAULT_WHAT_IF_SCALE_FACTOR),
          formulaCell('WhatIfRegionMultiplier', DEFAULT_WHAT_IF_REGION_MULTIPLIER),
          formulaCell(`B${rowNumber}*C${rowNumber}*D${rowNumber}`, scenarioMonthly),
          formulaCell(`E${rowNumber}*12`, scenarioYearly),
          formulaCell(`E${rowNumber}-B${rowNumber}`, deltaMonthly),
          formulaCell(`G${rowNumber}*12`, deltaYearly),
        ],
      };
    }),
  );

  if (scenarios.length === 0) {
    rows.push({
      cells: [
        'No provider has an eligible selected pricing model for this what-if sheet.',
        '',
        '',
      ],
    });
  }

  const providerEndRow = scenarios.length > 0 ? providerStartRow + scenarios.length - 1 : undefined;
  rows.push(
    {
      cells: [],
    },
    {
      cells: ['Workbook Summary'],
      style: 2,
    },
  );
  const scenarioSummaries = scenarios.map((scenario) => {
    const scenarioMonthly = roundCurrency(
      scenario.baselineMonthlyUsd * DEFAULT_WHAT_IF_SCALE_FACTOR * DEFAULT_WHAT_IF_REGION_MULTIPLIER,
    );

    return {
      scenarioMonthly,
      deltaMonthly: roundCurrency(scenarioMonthly - scenario.baselineMonthlyUsd),
    };
  });
  const totalScenarioMonthly = roundCurrency(
    scenarioSummaries.reduce((sum, value) => sum + value.scenarioMonthly, 0),
  );
  const totalDeltaMonthly = roundCurrency(
    scenarioSummaries.reduce((sum, value) => sum + value.deltaMonthly, 0),
  );
  const cheapestScenarioMonthly =
    scenarioSummaries.length > 0
      ? Math.min(...scenarioSummaries.map((scenario) => scenario.scenarioMonthly))
      : 0;

  rows.push(
    {
      cells: [
        'Cheapest scenario monthly USD',
        formulaCell(
          scenarios.length > 0 ? 'MIN(WhatIfScenarioMonthlyTotals)' : '0',
          cheapestScenarioMonthly,
        ),
      ],
    },
    {
      cells: [
        'Total scenario monthly USD',
        formulaCell(
          scenarios.length > 0 ? 'SUM(WhatIfScenarioMonthlyTotals)' : '0',
          totalScenarioMonthly,
        ),
      ],
    },
    {
      cells: [
        'Total delta monthly USD',
        formulaCell(scenarios.length > 0 ? 'SUM(WhatIfMonthlyDeltas)' : '0', totalDeltaMonthly),
      ],
    },
  );

  return {
    rows,
    providerStartRow: scenarios.length > 0 ? providerStartRow : undefined,
    providerEndRow,
    scaleFactorRow: 5,
    regionMultiplierRow: 6,
    monthlyDeltaStartRow: scenarios.length > 0 ? providerStartRow : undefined,
    monthlyDeltaEndRow: providerEndRow,
  };
}

function evidenceSheet(name: string, sourceRows: string[][]): SheetDefinition {
  return {
    name,
    rows: [
      {
        cells: [name],
        style: 1,
      },
      {
        cells: [],
      },
      ...sourceRows.map((row, index) => ({
        cells: row.map(sanitizeSpreadsheetText),
        ...(index === 0 ? { style: 2 } : {}),
      })),
    ],
  };
}

function breakEvenRows(result: ComparisonResult): BreakEvenSheet {
  const rows: WorksheetRow[] = [
    {
      cells: ['PolyCost Break-Even Analysis'],
      style: 1,
    },
    {
      cells: [
        'Scenario context',
        'Edit the on-demand multiplier, then recalculate the workbook to test negotiated-rate sensitivity.',
      ],
    },
    {
      cells: [],
    },
    {
      cells: ['Editable assumption', 'Value', 'How to use'],
      style: 2,
    },
    {
      cells: [
        'On-demand monthly multiplier',
        DEFAULT_BREAK_EVEN_ON_DEMAND_MULTIPLIER,
        'Use 0.9 to model a 10% negotiated on-demand discount, or 1.1 to model a 10% premium.',
      ],
    },
    {
      cells: [],
    },
    {
      cells: ['Provider commitment timeline'],
      style: 2,
    },
    {
      cells: [
        'Provider',
        'Pricing model',
        'Month',
        'On-demand monthly USD',
        'Committed monthly USD',
        'Upfront USD',
        'On-demand cumulative USD',
        'Committed cumulative USD',
        'Break-even reached (1=yes)',
        'Evidence',
      ],
      style: 2,
    },
  ];
  const timelineRows = commitmentTimelineRows(result);

  if (timelineRows.length === 0) {
    rows.push({
      cells: ['No commitment model has enough pricing evidence for break-even analysis.'],
    });
  } else {
    rows.push(
      ...timelineRows.map((timeline, index) => {
        const rowNumber = rows.length + index + 1;
        const onDemandCumulative = roundCurrency(
          timeline.onDemandMonthlyUsd *
            timeline.month *
            DEFAULT_BREAK_EVEN_ON_DEMAND_MULTIPLIER,
        );
        const committedCumulative = roundCurrency(
          timeline.upfrontUsd + timeline.committedMonthlyUsd * timeline.month,
        );

        return {
          cells: [
            timeline.providerId,
            labelForPricingModel(timeline.pricingModel),
            timeline.month,
            timeline.onDemandMonthlyUsd,
            timeline.committedMonthlyUsd,
            timeline.upfrontUsd,
            formulaCell(
              `D${rowNumber}*C${rowNumber}*BreakEvenOnDemandMultiplier`,
              onDemandCumulative,
            ),
            formulaCell(`F${rowNumber}+E${rowNumber}*C${rowNumber}`, committedCumulative),
            formulaCell(
              `IF(H${rowNumber}<=G${rowNumber},1,0)`,
              committedCumulative <= onDemandCumulative ? 1 : 0,
            ),
            sanitizeSpreadsheetText(timeline.evidence),
          ],
        };
      }),
    );
  }

  return {
    rows,
    onDemandMultiplierRow: 5,
  };
}

function commitmentTimelineRows(result: ComparisonResult): Array<{
  providerId: ComparisonResult['providers'][number]['providerId'];
  pricingModel: NonNullable<ReportOptions['pricingModel']>;
  month: number;
  onDemandMonthlyUsd: number;
  committedMonthlyUsd: number;
  upfrontUsd: number;
  evidence: string;
}> {
  const months = [0, 1, 3, 6, 12, 24, 36];

  return result.providers.flatMap((provider) => {
    const onDemandMonthlyUsd =
      provider.pricingModels?.find((model) => model.model === 'on-demand')?.monthlyCostUsd ??
      provider.totals.monthly;

    return ['reserved-1yr', 'reserved-3yr', 'savings-plan'].flatMap((pricingModel) => {
      const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

      if (!model?.available || model.monthlyCostUsd === undefined) {
        return [];
      }

      return months.map((month) => ({
        providerId: provider.providerId,
        pricingModel: pricingModel as NonNullable<ReportOptions['pricingModel']>,
        month,
        onDemandMonthlyUsd,
        committedMonthlyUsd: model.monthlyCostUsd ?? 0,
        upfrontUsd: model.upfrontCostUsd ?? 0,
        evidence: model.caveat ?? model.providerTerm ?? 'Cached provider commitment pricing.',
      }));
    });
  });
}

function whatIfBaselineMonthlyCost(
  provider: ComparisonResult['providers'][number],
  pricingModel: ReportOptions['pricingModel'],
): number | undefined {
  if (!pricingModel || pricingModel === 'on-demand') {
    return provider.totals.monthly;
  }

  const model: PricingModelCost | undefined = provider.pricingModels?.find(
    (candidate) => candidate.model === pricingModel,
  );

  return model?.available === true ? model.monthlyCostUsd : undefined;
}

function namedRangesForWorkbook(
  comparisonRows: WorksheetRow[],
  whatIfSheet: WhatIfSheet,
  breakEvenSheet: BreakEvenSheet,
  providerCount: number,
): NamedRange[] {
  const providerTotalsHeaderRow = sectionHeaderRow(comparisonRows, 'Provider Totals');
  const providerTotalsStartRow =
    providerTotalsHeaderRow !== undefined ? providerTotalsHeaderRow + 2 : undefined;
  const providerTotalsEndRow =
    providerTotalsStartRow !== undefined ? providerTotalsStartRow + providerCount - 1 : undefined;
  const namedRanges: NamedRange[] = [
    {
      name: 'WhatIfScaleFactor',
      reference: `'What If'!$B$${whatIfSheet.scaleFactorRow}`,
    },
    {
      name: 'WhatIfRegionMultiplier',
      reference: `'What If'!$B$${whatIfSheet.regionMultiplierRow}`,
    },
    {
      name: 'BreakEvenOnDemandMultiplier',
      reference: `'Break-Even Analysis'!$B$${breakEvenSheet.onDemandMultiplierRow}`,
    },
  ];

  if (
    providerTotalsStartRow !== undefined &&
    providerTotalsEndRow !== undefined &&
    providerTotalsStartRow <= providerTotalsEndRow
  ) {
    namedRanges.push(
      {
        name: 'ComparisonProviderNames',
        reference: `'Comparison'!$A$${providerTotalsStartRow}:$A$${providerTotalsEndRow}`,
      },
      {
        name: 'ComparisonMonthlyTotals',
        reference: `'Comparison'!$D$${providerTotalsStartRow}:$D$${providerTotalsEndRow}`,
      },
    );
  }

  if (
    whatIfSheet.providerStartRow !== undefined &&
    whatIfSheet.providerEndRow !== undefined &&
    whatIfSheet.monthlyDeltaStartRow !== undefined &&
    whatIfSheet.monthlyDeltaEndRow !== undefined
  ) {
    namedRanges.push(
      {
        name: 'WhatIfScenarioMonthlyTotals',
        reference: `'What If'!$E$${whatIfSheet.providerStartRow}:$E$${whatIfSheet.providerEndRow}`,
      },
      {
        name: 'WhatIfMonthlyDeltas',
        reference: `'What If'!$G$${whatIfSheet.monthlyDeltaStartRow}:$G$${whatIfSheet.monthlyDeltaEndRow}`,
      },
    );
  }

  return namedRanges;
}

function sectionHeaderRow(rows: WorksheetRow[], sectionName: string): number | undefined {
  const index = rows.findIndex((row) => row.cells[0] === sectionName);

  return index === -1 ? undefined : index + 1;
}

function formulaCell(formula: string, value: number): FormulaCell {
  return {
    formula,
    value: roundCurrency(value),
  };
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

  if (isFormulaCell(value)) {
    return `<c r="${ref}"${styleAttribute}><f>${escapeXml(value.formula)}</f><v>${value.value}</v></c>`;
  }

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

function isFormulaCell(value: CellValue): value is FormulaCell {
  return typeof value === 'object';
}

function contentTypesXml(sheetCount: number): string {
  return xmlDocument(`
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      ${Array.from(
        { length: sheetCount },
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      ).join('')}
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

function workbookXml(sheets: SheetDefinition[], namedRanges: NamedRange[]): string {
  return xmlDocument(`
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        ${sheets
          .map(
            (sheet, index) =>
              `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
          )
          .join('')}
      </sheets>
      <definedNames>
        ${namedRanges
          .map(
            (namedRange) =>
              `<definedName name="${namedRange.name}">${escapeXml(namedRange.reference)}</definedName>`,
          )
          .join('')}
      </definedNames>
      <calcPr calcMode="auto" fullCalcOnLoad="1"/>
    </workbook>
  `);
}

function workbookRelationshipsXml(sheetCount: number): string {
  return xmlDocument(`
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${Array.from(
        { length: sheetCount },
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      ).join('')}
      <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
