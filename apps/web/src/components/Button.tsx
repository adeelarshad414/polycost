import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ProviderBadgeProvider = 'aws' | 'azure' | 'gcp';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: ReactNode;
}

export interface ProviderBadgeProps {
  provider: ProviderBadgeProvider;
  children: ReactNode;
  className?: string;
}

/**
 * Shared PolyCost action button.
 *
 * Variants:
 * - primary: one main action per view or section.
 * - secondary: outlined supporting action.
 * - ghost: low-emphasis transparent action.
 * - destructive: irreversible or clearing/deleting action.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', className, children, loading = false, loadingLabel, onClick, ...props },
  ref,
) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onClick?.(event);
  }

  return (
    <button
      ref={ref}
      aria-busy={loading || undefined}
      aria-disabled={loading || props.disabled || undefined}
      data-loading={loading ? 'true' : undefined}
      className={joinClassNames(
        'pc-button',
        loadingLabel ? 'min-w-[9rem]' : undefined,
        'data-[loading=true]:pointer-events-none data-[loading=true]:cursor-progress data-[loading=true]:opacity-[0.85]',
        buttonVariantClassName(variant),
        className,
      )}
      onClick={handleClick}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2" aria-live="polite">
          <ButtonLoadingIcon />
          {loadingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
});

/**
 * Provider badges identify AWS/Azure/GCP. They are labels, not actions, and must not
 * use filled CTA styling.
 */
export function ProviderBadge({ provider, children, className }: ProviderBadgeProps) {
  return (
    <span className={joinClassNames('provider-badge', providerBadgeClassName(provider), className)}>
      {children}
    </span>
  );
}

export function ButtonSystemPreview() {
  return (
    <div className="button-system-preview" aria-label="Button system preview">
      <Button variant="primary" type="button">
        Primary
      </Button>
      <Button variant="secondary" type="button">
        Secondary
      </Button>
      <Button variant="ghost" type="button">
        Ghost
      </Button>
      <Button variant="destructive" type="button">
        Destructive
      </Button>
      <Button variant="primary" type="button" loading loadingLabel="Loading">
        Loading
      </Button>
      <ProviderBadge provider="aws">AWS</ProviderBadge>
      <ProviderBadge provider="azure">Azure</ProviderBadge>
      <ProviderBadge provider="gcp">GCP</ProviderBadge>
    </div>
  );
}

function ButtonLoadingIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="button-icon button-loading-mark animate-spin motion-reduce:animate-none"
    >
      <path className="button-loading-arc button-loading-arc-aws" d="M12 3a9 9 0 0 1 7.8 4.5" />
      <path
        className="button-loading-arc button-loading-arc-azure"
        d="M20.6 11.1a9 9 0 0 1-4.8 8"
      />
      <path
        className="button-loading-arc button-loading-arc-gcp"
        d="M11.5 20.9A9 9 0 0 1 3.4 8.2"
      />
    </svg>
  );
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function buttonVariantClassName(variant: ButtonVariant): string {
  switch (variant) {
    case 'primary':
      return 'pc-button-primary';
    case 'secondary':
      return 'pc-button-secondary';
    case 'ghost':
      return 'pc-button-ghost';
    case 'destructive':
      return 'pc-button-destructive';
  }
}

function providerBadgeClassName(provider: ProviderBadgeProvider): string {
  switch (provider) {
    case 'aws':
      return 'provider-badge-aws';
    case 'azure':
      return 'provider-badge-azure';
    case 'gcp':
      return 'provider-badge-gcp';
  }
}
