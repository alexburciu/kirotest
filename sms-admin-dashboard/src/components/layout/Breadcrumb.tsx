import { useLocation } from "react-router-dom";

const ROUTE_LABELS: Record<string, string> = {
  "/triggers": "Trigger Config",
  "/monitor": "Campaign Monitor",
  "/providers": "Provider Settings",
};

export function Breadcrumb() {
  const { pathname } = useLocation();

  const label =
    Object.entries(ROUTE_LABELS).find(([prefix]) =>
      pathname.startsWith(prefix)
    )?.[1] ?? "";

  return (
    <nav aria-label="breadcrumb">
      <span className="text-sm font-medium text-foreground">{label}</span>
    </nav>
  );
}
