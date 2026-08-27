import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function buttonClasses(variant: ButtonVariant = 'primary', className?: string) {
  return clsx(
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-teal text-white hover:bg-teal/90',
    variant === 'secondary' && 'border border-slate/30 bg-white text-ink hover:bg-slate/5',
    variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
    className,
  );
}

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={buttonClasses(variant, className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-lg border border-slate/30 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/60 focus:border-teal focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'w-full rounded-lg border border-slate/30 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/60 focus:border-teal focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'w-full rounded-lg border border-slate/30 bg-white px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx('mb-1 block text-xs font-medium text-slate', className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('rounded-xl border border-slate/15 bg-white p-6 shadow-sm', className)} {...props} />;
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-danger">{children}</p>;
}
