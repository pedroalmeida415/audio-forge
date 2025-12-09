export function ProjectList() {
  // TODO: list projects using useSuspenseQuery to show loading state
  // e.g. const [ projects ] = api.project.list.useSuspenseQuery();
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project, index) => (
        <div
          className="animate-fade-up opacity-0"
          key={project.id}
          style={{ animationDelay: `${0.15 + index * 0.05}s` }}
        >
          <ProjectCard project={project} />
        </div>
      ))}
    </div>
  );
}
