import {
  DEFAULT_PROVIDER_CONFIG,
  type ProviderEvent,
  type SportsProvider,
} from "./types";

// Always-available fallback provider. Supports no sport and returns no
// data, so the dashboard and refresh flows work with zero real adapters
// configured (docs/PRD.md section 51).
export const ManualSportsProvider: SportsProvider = {
  key: "manual",
  config: DEFAULT_PROVIDER_CONFIG,

  supportsSport(): boolean {
    return false;
  },

  async getSchedule(): Promise<ProviderEvent[]> {
    return [];
  },
};
