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

    getAppVersion: () => Promise<string>;

    checkForUpdates: () => Promise<any>;

    downloadUpdate: () => Promise<any>;

    installUpdate: () => Promise<any>;

    onUpdateStatus: (callback: (data: any) => void) => void;
  };
}
