import { type ReactNode, type RefObject, useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

type OverlaySize = 'confirm' | 'form' | 'rich';
type OverlaySide = 'right' | 'left';
type ToastTone = 'info' | 'success' | 'warning' | 'critical';
type BannerTone = 'info' | 'success' | 'warning' | 'critical';

export interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  description?: ReactNode;
  dismissible?: boolean;
  size?: OverlaySize;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmationText?: string;
  confirmationValue?: string;
  confirming?: boolean;
  onConfirmationValueChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface DrawerProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: OverlaySide;
  dismissible?: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface PopoverProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

export interface ToastStackProps {
  items: ToastItem[];
  onDismiss?: (id: string) => void;
}

export interface BannerProps {
  title: string;
  children?: ReactNode;
  tone?: BannerTone;
  actionLabel?: string;
  onAction?: () => void;
  dismissLabel?: string;
  onDismiss?: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Dialog({
  open,
  title,
  children,
  footer,
  description,
  dismissible = true,
  size = 'form',
  initialFocusRef,
  onOpenChange,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);

  useOverlayLifecycle({
    open,
    overlayRef,
    initialFocusRef,
    onClose: dismissible ? () => onOpenChange(false) : undefined,
  });

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pc-overlay-root"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <section
        className={`pc-dialog pc-dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        {dismissible ? (
          <Button
            type="button"
            variant="icon"
            size="compact"
            className="pc-dialog-close"
            aria-label="Close dialog"
            onClick={() => onOpenChange(false)}
          >
            <span aria-hidden="true">x</span>
          </Button>
        ) : null}
        <header className="pc-dialog-header">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </header>
        <div className="pc-dialog-body">{children}</div>
        {footer ? <footer className="pc-dialog-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  confirmationText,
  confirmationValue = '',
  confirming = false,
  onConfirmationValueChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const requiresTypedConfirmation = Boolean(confirmationText);
  const confirmationMatches = !requiresTypedConfirmation || confirmationValue === confirmationText;

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      dismissible={false}
      size="confirm"
      initialFocusRef={destructive ? cancelRef : undefined}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      footer={
        <>
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'primary'}
            loading={confirming}
            loadingLabel={destructive ? 'Deleting...' : 'Working...'}
            disabled={!confirmationMatches || confirming}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {confirmationText ? (
        <label className="pc-dialog-confirmation">
          <span>Type {confirmationText} to confirm</span>
          <input
            value={confirmationValue}
            onChange={(event) => onConfirmationValueChange?.(event.currentTarget.value)}
          />
        </label>
      ) : null}
    </Dialog>
  );
}

export function Drawer({
  open,
  title,
  children,
  footer,
  side = 'right',
  dismissible = true,
  onOpenChange,
}: DrawerProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);

  useOverlayLifecycle({
    open,
    overlayRef,
    onClose: dismissible ? () => onOpenChange(false) : undefined,
  });

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pc-overlay-root"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <aside
        className={`pc-drawer pc-drawer-${side}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="pc-drawer-header">
          <h2 id={titleId}>{title}</h2>
          {dismissible ? (
            <Button
              type="button"
              variant="icon"
              size="compact"
              aria-label="Close drawer"
              onClick={() => onOpenChange(false)}
            >
              <span aria-hidden="true">x</span>
            </Button>
          ) : null}
        </header>
        <div className="pc-drawer-body">{children}</div>
        {footer ? <footer className="pc-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

export function Popover({ open, title, children, onOpenChange }: PopoverProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleDocumentPointer(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentPointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="pc-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby={title ? titleId : undefined}
    >
      {title ? <h3 id={titleId}>{title}</h3> : null}
      <div className="pc-popover-body">{children}</div>
    </div>
  );
}

export function ToastStack({ items, onDismiss }: ToastStackProps) {
  const visibleItems = useMemo(() => items.slice(0, 2), [items]);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="pc-toast-viewport" aria-label="Notifications">
      {visibleItems.map((item) => {
        const tone = item.tone ?? 'info';
        const isCritical = tone === 'critical';
        return (
          <article
            key={item.id}
            className={`pc-toast pc-toast-${tone}`}
            role={isCritical ? 'alert' : 'status'}
          >
            <div>
              <strong>{item.title}</strong>
              {item.message ? <p>{item.message}</p> : null}
            </div>
            {item.actionLabel && item.onAction ? (
              <Button type="button" variant="link" size="compact" onClick={item.onAction}>
                {item.actionLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="icon"
              size="compact"
              aria-label={`Dismiss ${item.title}`}
              onClick={() => {
                item.onDismiss?.();
                onDismiss?.(item.id);
              }}
            >
              <span aria-hidden="true">x</span>
            </Button>
          </article>
        );
      })}
    </div>
  );
}

export function Banner({
  title,
  children,
  tone = 'info',
  actionLabel,
  onAction,
  dismissLabel = 'Dismiss banner',
  onDismiss,
}: BannerProps) {
  return (
    <section
      className={`pc-banner pc-banner-${tone}`}
      role={tone === 'critical' ? 'alert' : 'status'}
    >
      <div className="pc-banner-copy">
        <strong>{title}</strong>
        {children ? <span>{children}</span> : null}
      </div>
      <div className="pc-banner-actions">
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant={tone === 'info' ? 'secondary' : 'ghost'}
            size="compact"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
        {onDismiss ? (
          <Button
            type="button"
            variant="icon"
            size="compact"
            aria-label={dismissLabel}
            onClick={onDismiss}
          >
            <span aria-hidden="true">x</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function useOverlayLifecycle({
  open,
  overlayRef,
  initialFocusRef,
  onClose,
}: {
  open: boolean;
  overlayRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const hiddenSiblings = hideBodySiblings(overlayRef);

    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const overlay = overlayRef.current;
      const focusTarget =
        initialFocusRef?.current ??
        overlay?.querySelector<HTMLElement>('[data-dialog-cancel]') ??
        focusableElements(overlay)[0] ??
        overlay;
      focusTarget?.focus();
    }, 0);

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (!overlayRef.current) {
        return;
      }

      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        trapFocus(event, overlayRef.current);
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      hiddenSiblings.forEach(({ element, ariaHidden, inert }) => {
        restoreAttribute(element, 'aria-hidden', ariaHidden);
        restoreAttribute(element, 'inert', inert);
      });
      previouslyFocused?.focus();
    };
  }, [initialFocusRef, onClose, open, overlayRef]);
}

function hideBodySiblings(overlayRef: RefObject<HTMLElement | null>) {
  const overlay = overlayRef.current;
  return Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => overlay && element !== overlay && !element.contains(overlay))
    .map((element) => {
      const previous = {
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.getAttribute('inert'),
      };
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
      return previous;
    });
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }

  element.setAttribute(name, value);
}

function trapFocus(event: globalThis.KeyboardEvent, overlay: HTMLElement) {
  const focusable = focusableElements(overlay);
  if (focusable.length === 0) {
    event.preventDefault();
    overlay.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusableElements(root: HTMLElement | null | undefined): HTMLElement[] {
  if (!root) {
    return [];
  }

  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  );
}
