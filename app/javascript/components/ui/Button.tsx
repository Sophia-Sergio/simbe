import { forwardRef } from "react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Link } from "react-router-dom"
import type { LinkProps } from "react-router-dom"
import { Spinner } from "./Spinner"

export type ButtonVariant = "primary" | "outline-brand" | "secondary" | "ghost" | "danger"
export type ButtonSize = "md" | "sm"

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  "outline-brand": "border border-brand-border text-brand-text hover:bg-brand-tint",
  secondary: "border border-line bg-surface text-ink hover:bg-subtle",
  ghost: "text-ink-secondary hover:bg-subtle",
  danger: "bg-danger text-white hover:bg-danger-text",
}

const SIZE: Record<ButtonSize, string> = {
  md: "h-9 px-4",
  sm: "h-[30px] px-4",
}

function buttonClasses(variant: ButtonVariant, size: ButtonSize, className: string): string {
  return [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[14px] font-semibold transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    SIZE[size],
    VARIANT[variant],
    className,
  ].join(" ")
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  pending?: boolean
  leftIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", pending = false, leftIcon, className = "", children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending ? true : undefined}
      data-pending={pending ? "true" : undefined}
      className={`relative ${buttonClasses(variant, size, className)}`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-2 ${pending ? "invisible" : ""}`}>
        {leftIcon}
        {children}
      </span>
      {pending && (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <Spinner size={16} />
        </span>
      )}
    </button>
  )
})

export type LinkButtonProps = LinkProps & {
  variant?: ButtonVariant
  size?: ButtonSize
  leftIcon?: ReactNode
}

export function LinkButton({ variant = "primary", size = "md", leftIcon, className = "", children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {leftIcon}
      {children}
    </Link>
  )
}
