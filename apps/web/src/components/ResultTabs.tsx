import { useCallback, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Tabs for the comparison result.
 *
 * The result used to be one continuous scroll: an executive brief, then
 * engineering controls, then architecture evidence, then exports, all stacked
 * behind a single "Show full breakdown" disclosure. Reaching the export buttons
 * meant scrolling past several thousand pixels of analysis, and there was no way
 * to tell how much was left.
 *
 * The four groups already existed as separately headed sections, so this does
 * not reorganise the content - it gives the existing structure a control
 * surface.
 */

export interface ResultTab {
  id: string;
  label: string;
  /** One line under the tab strip saying what this view is for. */
  hint: string;
  content: ReactNode;
}

export function ResultTabs({
  tabs,
  ariaLabel = 'Comparison result views',
}: {
  tabs: ResultTab[];
  ariaLabel?: string;
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  const focusTab = useCallback((id: string) => {
    setActiveId(id);
    // Move focus with the selection so a keyboard user is not left behind on
    // the previous tab.
    tabRefs.current.get(id)?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = tabs.length - 1;
      let nextIndex: number | undefined;

      // Arrow-key roving focus is what makes a tablist a tablist rather than a
      // row of buttons; without it the pattern is a lie to a screen reader.
      if (event.key === 'ArrowRight') {
        nextIndex = index === lastIndex ? 0 : index + 1;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = index === 0 ? lastIndex : index - 1;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = lastIndex;
      }

      if (nextIndex === undefined) {
        return;
      }

      event.preventDefault();
      focusTab(tabs[nextIndex].id);
    },
    [focusTab, tabs],
  );

  if (!active) {
    return null;
  }

  return (
    <div className="result-tabs">
      <div className="result-tablist" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active.id;

          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(tab.id, node);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              // Only the selected tab is in the tab order; the arrows move
              // between them from there.
              tabIndex={selected ? 0 : -1}
              className={selected ? 'result-tab result-tab-active' : 'result-tab'}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="result-tab-hint">{active.hint}</p>

      {/*
        Every panel stays mounted and inactive ones are hidden, rather than
        rendering only the active one. This is a cost report people print, and
        the print stylesheet exists to lay the whole thing out - unmounting
        would silently reduce a printed report to whichever tab happened to be
        open. Hidden panels are correctly absent from the accessibility tree,
        and the print rules reveal them again.
      */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active.id}
          // Focusable so a keyboard user tabbing off the strip lands in the
          // panel content rather than skipping past it.
          tabIndex={0}
          className="result-tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
