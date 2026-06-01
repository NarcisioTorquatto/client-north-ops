const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("northOps", {
  appName: "NORTH OPS Client",

  onSimData: (callback) => {
    ipcRenderer.on("sim-data", (_event, data) => callback(data));
  },

  applyBriefingToAircraft: (briefing) => {
    return ipcRenderer.invoke("apply-briefing-to-aircraft", briefing);
  },
});