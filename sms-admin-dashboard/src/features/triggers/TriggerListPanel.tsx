import * as React from "react";
import type { TriggerDefinition } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TriggerListPanelProps {
  triggers: TriggerDefinition[];
  selectedTriggerId: string | null;
  onSelectTrigger: (trigger: TriggerDefinition) => void;
  onNewTrigger: () => void;
  isLoading?: boolean;
}

export function TriggerListPanel({
  triggers,
  selectedTriggerId,
  onSelectTrigger,
  onNewTrigger,
  isLoading = false,
}: TriggerListPanelProps) {
  const [search, setSearch] = React.useState("");
  const [funnelStepFilter, setFunnelStepFilter] = React.useState("all");

  // Derive unique funnel step values from the triggers list
  const funnelSteps = React.useMemo(() => {
    const steps = Array.from(new Set(triggers.map((t) => t.funnelStep)));
    return steps.sort();
  }, [triggers]);

  const filtered = React.useMemo(() => {
    return triggers.filter((t) => {
      const matchesSearch = t.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesFunnel =
        funnelStepFilter === "all" || t.funnelStep === funnelStepFilter;
      return matchesSearch && matchesFunnel;
    });
  }, [triggers, search, funnelStepFilter]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Triggers</h2>
        <Button size="sm" onClick={onNewTrigger}>
          New Trigger
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
          aria-label="Search triggers"
        />
        <Select value={funnelStepFilter} onValueChange={setFunnelStepFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by funnel step">
            <SelectValue placeholder="All steps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {funnelSteps.map((step) => (
              <SelectItem key={step} value={step}>
                {step}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" role="list">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No triggers found.
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((trigger) => {
              const isSelected = trigger.id === selectedTriggerId;
              return (
                <li key={trigger.id} role="listitem">
                  <button
                    type="button"
                    onClick={() => onSelectTrigger(trigger)}
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card"
                    )}
                    aria-pressed={isSelected}
                    aria-label={`Select trigger ${trigger.name}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Name */}
                      <span className="font-bold leading-snug">
                        {trigger.name}
                      </span>

                      {/* Status pill */}
                      {trigger.isActive ? (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Funnel step badge */}
                    <div className="mt-1.5">
                      <Badge variant="secondary">{trigger.funnelStep}</Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
