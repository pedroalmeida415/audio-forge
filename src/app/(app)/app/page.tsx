import { HydrateClient } from "~/trpc/server";
import { FloatingNav } from "./_component/floating-nav";
import { ProjectList } from "./_component/project-list";

export default async function Home() {
  return (
    <HydrateClient>
      <ProjectList />
      <FloatingNav />
    </HydrateClient>
  );
}
