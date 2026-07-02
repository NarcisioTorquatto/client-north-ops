const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;

let mainWindow;
let pythonProcess;
const pendingCommands = new Map();

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 900,
    minHeight: 720,    
    
    backgroundColor: "#020817",
    icon: path.join(__dirname, "../resources/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function getBridgePath() {
  if (isDev) {
    return path.join(__dirname, "../resources/bridge/northops-bridge.exe");
  }

  return path.join(process.resourcesPath, "bridge", "northops-bridge.exe");
}

function sendBridgeStatus(status) {
  sendToRenderer("sim-data", {
    connected: false,
    aircraft: null,
    latitude: null,
    longitude: null,
    altitude_ft: null,
    ground_speed: null,
    heading: null,
    g_force: null,
    bank_degrees: null,
    pitch_degrees: null,
    vertical_speed: null,
    airspeed_indicated: null,
    fuel_percent: null,
    fuel_total_quantity: null,
    fuel_total_capacity: null,
    sim_rate: 1,
    on_ground: false,
    engine_running: false,
    bridge_status: status,
  });
}

function startSimBridge() {
  const bridgePath = getBridgePath();

  if (!fs.existsSync(bridgePath)) {
    sendBridgeStatus(`Bridge não encontrado em: ${bridgePath}`);
    return;
  }

  pythonProcess = spawn(bridgePath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  pythonProcess.stdout.on("data", (data) => {
    const lines = data.toString().trim().split("\n");

    lines.forEach((line) => {
      if (!line.trim()) return;

      try {
        const message = JSON.parse(line);

        if (message.type === "command_result") {
          const pending = pendingCommands.get(message.requestId);

          if (pending) {
            pendingCommands.delete(message.requestId);

            if (message.ok) pending.resolve(message);
            else pending.reject(new Error(message.error || "Erro ao executar comando."));
          }

          return;
        }

        sendToRenderer("sim-data", message);
      } catch (error) {
        console.error("Erro ao ler bridge:", error);
      }
    });
  });

  pythonProcess.stderr.on("data", (data) => {
    sendBridgeStatus(data.toString());
  });

  pythonProcess.on("error", (error) => {
    sendBridgeStatus(`Erro ao iniciar bridge: ${error.message}`);
  });

  pythonProcess.on("close", (code) => {
    sendBridgeStatus(`Bridge encerrada: ${code}`);
  });
}

function setupUpdater() {
  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update-status", {
      status: "checking",
      message: "Verificando atualizações...",
    });
  });

  autoUpdater.on("update-available", (info) => {
    sendToRenderer("update-status", {
      status: "available",
      version: info.version,
      percent: 0,
      message: `Nova versão encontrada: v${info.version}. Baixando automaticamente...`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("update-status", {
      status: "none",
      message: "Você já está na versão mais recente.",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update-status", {
      status: "downloading",
      percent: Math.round(progress.percent),
      message: `Baixando atualização: ${Math.round(progress.percent)}%`,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendToRenderer("update-status", {
      status: "downloaded",
      message: "Atualização pronta para instalar.",
    });
  });

  autoUpdater.on("error", (error) => {
    console.error(error);

    sendToRenderer("update-status", {
      status: "error",
      message: `Erro na atualização: ${error.message}`,
    });
  });


}

ipcMain.handle("get-app-version", () => {
  const packageJson = require("../package.json");
  return packageJson.version;
});

ipcMain.handle("set-compact-mode", (_event, compact) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (compact) {
    mainWindow.setMinimumSize(620, 680);
    mainWindow.setSize(680, 780);
    mainWindow.center();
    return;
  }

  mainWindow.setMinimumSize(900, 720);
  mainWindow.setSize(980, 740);
  mainWindow.center();
});

ipcMain.handle("check-for-updates", async () => {
  if (isDev) {
    return {
      status: "none",
      message: "",
    };
  }

  try {
    await autoUpdater.checkForUpdates();

    return {
      status: "checking",
      message: "Verificando atualizações...",
    };
  } catch {
    return {
      status: "error",
      message: "Erro ao verificar atualização.",
    };
  }
});


ipcMain.handle("download-update", async () => {
  await autoUpdater.downloadUpdate();

  return {
  status: "downloading",
  };

  
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("apply-briefing-to-aircraft", async (_event, briefing) => {
  if (!pythonProcess || pythonProcess.killed) {
    throw new Error("Bridge Python não está ativo.");
  }

  const requestId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const command = {
    type: "apply_briefing",
    requestId,
    payload: briefing,
  };

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(requestId);
      reject(new Error("Tempo esgotado ao aplicar briefing no simulador."));
    }, 10000);

    pendingCommands.set(requestId, {
      resolve: (data) => {
        clearTimeout(timeout);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    pythonProcess.stdin.write(JSON.stringify(command) + "\n");
  });
});

app.whenReady().then(() => {
  createWindow();
  startSimBridge();
  setupUpdater();

  autoUpdater.logger = console;
});


app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
