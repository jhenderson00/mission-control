import * as React from "react"

import { cn } from "@/lib/utils"

const Form = React.forwardRef<
  HTMLFormElement,
  React.ComponentPropsWithoutRef<"form">
>(({ className, ...props }, ref) => (
  <form
    ref={ref}
    data-slot="form"
    className={cn("space-y-4", className)}
    {...props}
  />
))
Form.displayName = "Form"

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="form-item"
    className={cn("space-y-2", className)}
    {...props}
  />
))
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    data-slot="form-label"
    className={cn("text-sm font-medium text-foreground", className)}
    {...props}
  />
))
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="form-control"
    className={cn("flex flex-col gap-2", className)}
    {...props}
  />
))
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="form-description"
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
))
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="form-message"
    className={cn("text-xs text-destructive", className)}
    {...props}
  />
))
FormMessage.displayName = "FormMessage"

export { Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage }
