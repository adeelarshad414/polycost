# How to Use PolyCost

This guide is for end users of the running application. For development or
deployment setup, see `DEPLOY.md` and contributor docs instead.

## What PolyCost does

PolyCost tells you what your application will cost to run on AWS, Azure, and GCP side
by side. You describe what you need, and PolyCost shows the equivalent setup and
price on all three providers.

## Getting started: describing your workload

You have three ways to tell PolyCost what you need.

### Option 1 - Describe it in plain English

Type a description of your application into the text box, the way you would explain
it to a colleague. For example:

> "I need a web app for about 5,000 people a day. It needs a Postgres database and
> storage for user-uploaded files, up to 5GB each. It should stay up even if one
> server goes down."

PolyCost reads this and works out the pieces it needs to price: compute, storage,
database, and high-availability needs. If a configured LLM parser is not available,
the self-hosted build falls back to a conservative local parser for common workload
phrases and marks defaulted fields for review.

You will see what it understood as an editable form. Check it before continuing,
because this is where you can correct anything it got wrong or fill in something it
missed.

### Option 2 - Fill in the form directly

If you already know exactly what you need, skip the text box and fill in the
structured form yourself: workload type, compute size, storage, database engine,
expected traffic, and region.

Even if you used the text description first, the form that appears afterward is the
same form. You can always switch to editing it directly.

### Option 3 - Upload a diagram

Use **Upload diagram** when you already have an architecture sketch. PolyCost accepts
Mermaid text, draw.io XML, Lucid-style CSV exports, and VSDX files up to 5MB.

After parsing, PolyCost shows a review panel with:

- Classified services and confidence levels.
- Assumed defaults such as compute size or storage capacity.
- Unresolved nodes that need manual classification.
- Decorative or ignored nodes.

The parsed result becomes the same editable workload form used by the other input
modes. Review and tune the sizing assumptions before comparing costs.

## Reading your comparison

Once you confirm your requirements, PolyCost shows three columns:

- AWS
- Azure
- GCP

This order never changes based on price. PolyCost does not put the cheapest option
first, so you can compare fairly without being nudged toward one provider.

Each column shows:

- The specific services PolyCost matched to your requirements.
- A line-by-line cost breakdown.
- A total at the bottom.

A dotted underline with an approximately-equal marker next to a line item means that
service does not have an exact match on that cloud. PolyCost is showing the closest
equivalent instead.

A "Lowest cost" badge appears next to whichever total is currently cheapest. It is an
informational marker, not a recommendation.

## Choosing your time period

Above the comparison, you can switch between Daily, Weekly, Monthly, Quarterly, and
Yearly views. The underlying numbers do not change. This only shows the same cost at
a different scale.

## Getting up-to-date pricing

By default, PolyCost shows pricing from its cached catalog. Local self-hosted stacks
include a small baseline catalog so the first comparison works before live ETL
credentials are configured. Once provider ETL data exists, real provider rows take
precedence over local seed rows.

If you want the latest number before making a final decision, click "Refresh live".
In the current OSS V1 build, this re-runs the stored workload against the current
local pricing catalog. Strict provider live re-query for only the exact SKUs in the
comparison is still a carried-forward hardening item.

Live refresh is rate-limited. If you hit the limit, wait a few minutes and try again.

## Exporting your comparison

Once you are happy with your comparison, you can save it three ways:

- PDF: a clean, shareable report.
- CSV: raw line-item data for your own spreadsheet.
- Excel: a formatted spreadsheet.

All three exports show the same numbers as the screen. Exporting does not re-run
pricing.

## Switching between light, dark, and system theme

Use the theme toggle in the header to switch between Light, Dark, and System. System
is the default and follows your device setting automatically.

## Using PolyCost on your phone

On smaller screens, the three columns become swipeable cards. Swipe left or right to
move between AWS, Azure, and GCP. A small bar at the top always shows all three totals
at once, so you do not lose the big picture.

## When something does not look right

- If a provider card says "Pricing unavailable" after a comparison, that provider's
  pricing data is temporarily unavailable. The other provider cards remain visible so
  the layout and provider order stay consistent.
- If your description was not understood correctly, go back and edit the form
  directly. Nothing is locked in until you confirm.

## A note on accuracy

PolyCost gives a decision-grade estimate, not a guaranteed invoice. Real cloud bills
can vary based on negotiated discounts, committed-use agreements, and usage patterns
that differ from what you described.

Use PolyCost to compare and decide with confidence, and confirm exact figures with
each provider's own calculator before finalizing a budget you are accountable for.
