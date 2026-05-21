import { Button } from "@/components/ui/button";

type ResourcePoolOption = {
  id: string;
  name: string;
  capacity: number;
};

type CreateReservationFormProps = {
  action: (formData: FormData) => Promise<void>;
  resourcePools: ResourcePoolOption[];
};

const startHourOptions = Array.from({ length: 24 }, (_, hour) => hour);
const endHourOptions = Array.from({ length: 23 }, (_, index) => index + 1);

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export function CreateReservationForm({
  action,
  resourcePools,
}: CreateReservationFormProps) {
  const defaultPool = resourcePools[0];

  return (
    <form action={action} className="grid gap-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">New reservation request</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Requests stay pending until a manager approves them.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Resource pool
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={defaultPool?.id}
            name="resourcePoolId"
            required
          >
            {resourcePools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name} ({pool.capacity} capacity)
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Date
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            name="date"
            required
            type="date"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Start hour
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="9"
            name="startHour"
            required
          >
            {startHourOptions.map((hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          End hour
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="10"
            name="endHour"
            required
          >
            {endHourOptions.map((hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Reason
        <textarea
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
          maxLength={500}
          name="reason"
          placeholder="Optional"
        />
      </label>

      <div>
        <Button disabled={resourcePools.length === 0} type="submit">
          Submit request
        </Button>
      </div>
    </form>
  );
}
