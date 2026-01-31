export const clerkAppearance = {
  variables: {
    colorPrimary: "#FF785A",
    colorTextOnPrimaryBackground: "#0b0f14",
    colorBackground: "#0b0f14",
    colorText: "#f8fafc",
    colorInputBackground: "rgba(15, 23, 42, 0.6)",
    colorInputText: "#e2e8f0",
    colorNeutral: "#94a3b8",
    borderRadius: "0.9rem",
  },
  elements: {
    card: "shadow-[0_30px_80px_rgba(0,0,0,0.45)] border border-border/60 bg-card/70 backdrop-blur",
    headerTitle: "text-2xl font-semibold font-display text-foreground",
    headerSubtitle: "text-sm text-muted-foreground",
    formFieldLabel: "text-xs uppercase tracking-wide text-muted-foreground",
    formFieldInput:
      "bg-background/60 border border-border/60 text-foreground focus-visible:ring-2 focus-visible:ring-primary/40",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_10px_30px_rgba(255,120,90,0.35)]",
    footerActionLink: "text-primary hover:text-primary/80",
    dividerLine: "bg-border/60",
    dividerText: "text-muted-foreground",
    formFieldWarningText: "text-amber-300",
    formFieldErrorText: "text-red-300",
  },
} as const;
