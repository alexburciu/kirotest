import * as React from "react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DelayStepField {
  id: string;
  delayAmount: number;
  delayUnit: "hours" | "days";
  messageTemplate: string;
}

interface DelayScheduleProps {
  /** react-hook-form useFieldArray fields */
  fields: DelayStepField[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** react-hook-form register function for the schedule field array */
  register: UseFormRegister<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  errors?: FieldErrors<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DelaySchedule({
  fields,
  onAdd,
  onRemove,
  onReorder,
  register,
  errors,
}: DelayScheduleProps) {
  /** Index of the row currently being dragged, or null when idle. */
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  /** Index of the row currently being dragged over, for visual feedback. */
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Drag helpers
  // -------------------------------------------------------------------------

  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    // Allow drop
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, dropIndex: number) {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No steps yet. Add one below.
        </p>
      )}

      {fields.map((field, index) => {
        const stepErrors = errors?.schedule?.[index] as
          | FieldErrors<DelayStepField>
          | undefined;
        const delayAmountError = stepErrors?.delayAmount;

        const isDragging = draggedIndex === index;
        const isOver = dragOverIndex === index && draggedIndex !== index;

        return (
          <div
            key={field.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-card p-3 transition-opacity",
              isDragging && "opacity-40",
              isOver && "border-primary ring-1 ring-primary"
            )}
            aria-label={`Step ${index + 1}`}
          >
            {/* Drag handle */}
            <div
              className="mt-2.5 cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-hidden="true"
            >
              <GripVertical size={18} />
            </div>

            {/* Step label */}
            <span className="mt-2.5 w-14 shrink-0 text-sm font-medium text-muted-foreground">
              Step {index + 1}
            </span>

            {/* Delay amount + unit toggle */}
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                {/* Numeric input */}
                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    min={1}
                    className={cn(
                      "w-24",
                      delayAmountError && "border-destructive focus-visible:ring-destructive"
                    )}
                    aria-label={`Delay amount for step ${index + 1}`}
                    aria-describedby={
                      delayAmountError
                        ? `delay-error-${index}`
                        : undefined
                    }
                    {...register(`schedule.${index}.delayAmount`, {
                      valueAsNumber: true,
                    })}
                  />
                </div>

                {/* Unit toggle: hrs / days */}
                <UnitToggle
                  index={index}
                  value={field.delayUnit}
                  register={register}
                />
              </div>

              {/* Inline error */}
              {delayAmountError?.message && (
                <p
                  id={`delay-error-${index}`}
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {String(delayAmountError.message)}
                </p>
              )}
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="mt-2 rounded p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove step ${index + 1}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}

      {/* Add step */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 self-start"
        onClick={onAdd}
      >
        <Plus size={16} />
        Add Step
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnitToggle — separate component so it can read its own registered value
// ---------------------------------------------------------------------------

interface UnitToggleProps {
  index: number;
  value: "hours" | "days";
  register: UseFormRegister<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Renders two toggle buttons for "hrs" / "days".
 * Uses a hidden `<select>` registered with react-hook-form so the value is
 * tracked in the form state without needing a Controller.
 */
function UnitToggle({ index, value, register }: UnitToggleProps) {
  // We need the current field value to drive button appearance.
  // The parent already passes `value` from the useFieldArray field snapshot,
  // but we also need to trigger changes. We use a ref to the hidden select.
  const selectRef = React.useRef<HTMLSelectElement | null>(null);

  const { ref: registerRef, ...rest } = register(`schedule.${index}.delayUnit`);

  function choose(unit: "hours" | "days") {
    if (selectRef.current) {
      selectRef.current.value = unit;
      // Dispatch a change event so react-hook-form picks up the update
      selectRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  return (
    <div className="flex items-center" role="group" aria-label="Delay unit">
      {/* Hidden native select registered with RHF */}
      <select
        {...rest}
        ref={(el) => {
          selectRef.current = el;
          registerRef(el);
        }}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      >
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>

      {/* Visible toggle buttons */}
      <button
        type="button"
        onClick={() => choose("hours")}
        className={cn(
          "rounded-l-md border border-r-0 border-input px-3 py-2 text-sm transition-colors",
          value === "hours"
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        aria-pressed={value === "hours"}
        aria-label="Hours"
      >
        hrs
      </button>
      <button
        type="button"
        onClick={() => choose("days")}
        className={cn(
          "rounded-r-md border border-input px-3 py-2 text-sm transition-colors",
          value === "days"
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        aria-pressed={value === "days"}
        aria-label="Days"
      >
        days
      </button>
    </div>
  );
}
