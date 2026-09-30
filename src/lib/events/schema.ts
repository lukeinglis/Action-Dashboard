import { z } from "zod";

export const createEventInputSchema = z.object({
  sport: z.string().min(1),
  league: z.string().min(1).optional(),
  name: z.string().min(1),
  startTimeUtc: z.string().datetime().optional(),
  startTimeTbd: z.boolean().optional().default(false),
  endTimeUtc: z.string().datetime().optional(),
  homeTeamId: z.string().uuid().optional(),
  awayTeamId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export type CreateEventInput = z.infer<typeof createEventInputSchema>;
