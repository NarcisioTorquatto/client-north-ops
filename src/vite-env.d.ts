/// <reference types="vite/client" />

interface Window {
  northOps: {
    appName: string;

    onSimData: (callback: (data: any) => void) => void;

    applyBriefingToAircraft: (briefing: {
      fuel_lbs: number;
      passenger_weight_kg: number;
      cargo_weight_kg: number;
      takeoff_weight_kg: number;
    }) => Promise<any>;
  };
}