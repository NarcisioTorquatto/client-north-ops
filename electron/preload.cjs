const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("northOps", {
  appName: "NORTH OPS Client",

  onSimData: (callback) => {
    ipcRenderer.on("sim-data", (_event, data) => callback(data));
  },

  applyBriefingToAircraft: (briefing) => {
    return ipcRenderer.invoke("apply-briefing-to-aircraft", briefing);
  },

  getAppVersion: () => {
    return ipcRenderer.invoke("get-app-version");
  },

  checkForUpdates: () => {
    return ipcRenderer.invoke("check-for-updates");
  },

  downloadUpdate: () => {
    return ipcRenderer.invoke("download-update");
  },

  installUpdate: () => {
    return ipcRenderer.invoke("install-update");
  },

  onUpdateStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, data) => callback(data));
  },
});