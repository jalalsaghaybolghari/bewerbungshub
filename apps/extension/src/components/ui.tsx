import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary';

export function buttonClasses(variant: ButtonVariant = 'primary', className?: string) {
  return clsx(
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-accent text-white hover:bg-accent/90',
    variant === 'secondary' && 'border border-slate/30 bg-white text-ink hover:bg-slate/5',
    className,
  );
}

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-lg border border-slate/30 bg-white px-3 py-2 text-base text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none',
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
        'w-full rounded-lg border border-slate/30 bg-white px-3 py-2 text-base text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none',
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
        'w-full rounded-lg border border-slate/30 bg-white px-3 py-2 text-base text-ink focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={clsx('mb-1 block text-sm font-medium text-slate', className)} {...props} />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-slate/15 bg-white p-4', className)} {...props} />
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-danger">{children}</p>;
}
