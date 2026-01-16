"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { authClient } from "~/server/better-auth/client";

export default function WebPage() {
  const handleGitHubLogin = () => {
    authClient.signIn.social({
      provider: "github",
      callbackURL: "/app",
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="font-bold text-2xl">Audio Forge</h1>
      <Button onClick={handleGitHubLogin}>Sign in with GitHub</Button>
      <Link
        className="text-muted-foreground text-sm hover:underline"
        href="/app"
      >
        Go to App
      </Link>
    </div>
  );
}
