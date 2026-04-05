export const AppIntro = () => {
  return (
    <div className="rounded-xl border border-border/70 bg-card/30 p-3 md:p-4">
      <div className="flex items-start gap-3 text-left sm:items-center">
        <img
          src="/ThothBlueprint-icon.svg"
          alt="ThothBlueprint Logo"
          className="mt-0.5 h-8 w-8 shrink-0 md:mt-0 md:h-10 md:w-10"
        />
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight md:text-xl">ThothBlueprint</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground md:text-sm">
            Visualize your database schema with an intuitive drag-and-drop editor. Export to SQL, DBML, JSON, SVG, or generate migration files for Laravel, TypeORM, and Django.
          </p>
        </div>
      </div>
    </div>
  );
};