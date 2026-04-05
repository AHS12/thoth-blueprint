import { Infinity as InfinityIcon, ShieldCheck, WifiOff } from "lucide-react";

export const Features = () => {
  const features = [
    {
      icon: <WifiOff className="h-6 w-6 text-primary" />,
      title: "Offline First",
      description: "Design anywhere, online or offline.",
    },
    {
      icon: <InfinityIcon className="h-6 w-6 text-primary" />,
      title: "No Limits",
      description: "Create as many diagrams as you need.",
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-primary" />,
      title: "Your Data is Yours",
      description: "Stored locally on your device for privacy.",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 md:gap-2">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/20 p-2.5 text-left"
          >
            <div className="shrink-0 rounded-full bg-muted p-1.5">
              {feature.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold md:text-sm">{feature.title}</h3>
              <p className="text-[11px] leading-snug text-muted-foreground md:text-xs">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};