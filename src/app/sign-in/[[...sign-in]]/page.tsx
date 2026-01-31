import { SignIn } from "@clerk/nextjs";
import { Rocket, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clerkAppearance } from "@/lib/clerk-appearance";

const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mission-background" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-stretch justify-center gap-10 px-4 py-12 lg:flex-row lg:items-center">
        <div className="space-y-6 lg:max-w-xl">
          <Badge variant="outline" className="w-fit text-xs uppercase tracking-[0.2em]">
            Secure Access
          </Badge>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold font-display sm:text-4xl">
              Enter Cydni Mission Control
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Authenticate to monitor real-time agent telemetry, decision chains,
              and mission readiness across your AI organization.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-border/60 bg-card/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Rocket className="h-4 w-4 text-primary" />
                  Fleet Status
                </CardTitle>
                <CardDescription>Live sync with Convex streams</CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-border/60 bg-card/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Verified Access
                </CardTitle>
                <CardDescription>Encrypted sessions + audit trails</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        <div className="flex w-full items-center justify-center lg:w-auto">
          {hasClerkKeys ? (
            <SignIn appearance={clerkAppearance} />
          ) : (
            <Card className="w-full max-w-md border-border/60 bg-card/60 text-center">
              <CardHeader>
                <CardTitle>Clerk keys missing</CardTitle>
                <CardDescription>
                  Add Clerk environment variables to enable secure sign in.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in
                your environment.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
