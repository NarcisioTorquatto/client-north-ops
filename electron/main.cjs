const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
let mainWindow;
let pythonProcess;

const pendingCommands = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#020817",
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

function startSimBridge() {
  const bridgePath = path.join(__dirname, "../simconnect/bridge.py");

  console.log("Iniciando bridge:", bridgePath);

  pythonProcess = spawn("python", [bridgePath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (data) => {
    const lines = data.toString().trim().split("\n");

    lines.forEach((line) => {
      if (!line.trim()) return;

      try {
        const message = JSON.parse(line);

        if (message.type === "command_result") {
          console.log("RESULTADO COMANDO PYTHON:", JSON.stringify(message, null, 2));
          const pending = pendingCommands.get(message.requestId);

          if (pending) {
            pendingCommands.delete(message.requestId);

            if (message.ok) {
              pending.resolve(message);
            } else {
              pending.reject(new Error(message.error || "Erro ao executar comando."));
            }
          }

          return;
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("sim-data", message);
        }
      } catch (error) {
        console.error("Erro ao ler dados do simulador:", line);
        console.error(error);
      }
    });
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error("Python error:", data.toString());
  });

  pythonProcess.on("error", (error) => {
    console.error("Erro ao iniciar Python:", error);
  });

  pythonProcess.on("close", (code) => {
    console.log("Bridge Python encerrada com código:", code);
  });
}

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
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});