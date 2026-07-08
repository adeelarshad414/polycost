# 10-Minute Demo Script

## 0:00-1:00 Opening

Show PolyCost as an open-source, self-hostable way to compare AWS, Azure, and GCP before committing architecture decisions.

## 1:00-2:30 Requirements Input

Use the guided form or Web app tier quick-start. Mention that natural language and diagram import feed the same Normalized Workload Specification.

## 2:30-4:00 Executive View

Run `Compare costs`. Highlight:

- cheapest provider
- monthly and yearly baseline
- confidence and caveats
- provider warnings if any

## 4:00-5:30 Engineering Evidence

Expand full breakdown. Show:

- service rows
- region/SKU evidence
- pricing evidence panel
- official calculator and region links

## 5:30-6:45 FinOps Controls

Switch pricing model, run what-if, show budget/alert/exchange/share surfaces.

## 6:45-8:00 Diagram And Terraform

Open diagram mode, explain draw.io/Lucid/Mermaid/VSDX extraction, then show Terraform starter bundle generation for one target cloud.

## 8:00-9:00 Reports

Export PDF, CSV, Excel, and evidence JSON. Position exports as proposal and review artifacts.

## 9:00-10:00 Honest Close

State clearly:

- estimates are decision-grade, not invoices
- local demo is verified(mock)
- real provider ETL and production SSO require configured credentials
- open-source core avoids vendor lock-in in the cost-comparison tool itself
