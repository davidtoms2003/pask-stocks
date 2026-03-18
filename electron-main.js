const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

let pythonProcess = null;
let nextProcess = null;
let mainWindow = null;

// Liberar puertos antes de arrancar (mata procesos zombie de ejecuciones anteriores)
function killPortProcesses() {
  const ports = [3000, 8000];
  for (const port of ports) {
    try {
      if (process.platform === 'win32') {
        execSync(`FOR /F "tokens=5" %a IN ('netstat -aon ^| findstr :${port}') DO taskkill /F /PID %a`, { stdio: 'ignore', shell: true });
      } else {
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore', shell: true });
      }
    } catch (e) {
      // Ignorar errores si no hay procesos en ese puerto
    }
  }
  console.log('[Electron] Puertos 3000 y 8000 liberados');
}

function startPythonBackend() {
  const pythonExecutable = path.join(__dirname, 'backend', 'venv', 'bin', 'python'); 
  
  console.log('[Electron] Arrancando backend Python...', pythonExecutable);

  // Usamos --reload para hot-reload durante desarrollo
  // La sesión de NotebookLM persiste porque usa ~/.notebooklm/storage_state.json
  pythonProcess = spawn(pythonExecutable, ['-m', 'uvicorn', 'app:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: path.join(__dirname, 'backend'),
    env: { ...process.env },
    detached: process.platform !== 'win32', // Necesario para matar el grupo de procesos en Unix
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    // Uvicorn logs to stderr, so this is normal output
    console.log(`[Backend]: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Backend] Process exited with code ${code}`);
  });

  pythonProcess.on('error', (err) => {
    console.error(`[Backend] Error starting process:`, err);
  });
}

function startNextDev() {
  console.log('[Electron] Arrancando servidor Next.js...');
  
  // Usar npx para evitar el warning de shell=true con argumentos
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  
  nextProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: __dirname,
    env: { ...process.env },
    detached: process.platform !== 'win32', // Necesario para matar el grupo de procesos en Unix
  });

  nextProcess.stdout.on('data', (data) => {
    console.log(`[Next.js]: ${data}`);
  });

  nextProcess.stderr.on('data', (data) => {
    console.log(`[Next.js]: ${data}`);
  });

  nextProcess.on('close', (code) => {
    console.log(`[Next.js] Process exited with code ${code}`);
  });

  nextProcess.on('error', (err) => {
    console.error(`[Next.js] Error starting process:`, err);
  });
}

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const http = require('http');
      const req = http.get(url, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for server'));
        } else {
          setTimeout(check, 500);
        }
      });
      req.end();
    };
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Usar configuración segura que NO rompe las APIs del navegador
      nodeIntegration: false,
      contextIsolation: true,
      // Habilitar web security para que fetch/localStorage funcionen correctamente
      webSecurity: true,
      // Permitir acceso a APIs web modernas
      allowRunningInsecureContent: false,
    }
  });

  // DevTools solo si se pasa --devtools como argumento
  if (process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Manejar navegación: permitir todas las URLs de localhost
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // Permitir navegación dentro de localhost (tanto frontend como backend)
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      console.log('[Electron] Navegación permitida a:', url);
      return; // Permitir navegación
    }
    // Para URLs externas, abrir en el navegador del sistema
    event.preventDefault();
    shell.openExternal(url);
    console.log('[Electron] URL externa abierta en navegador:', url);
  });

  // Manejar apertura de nuevas ventanas (target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      return { action: 'allow' };
    }
    // Abrir URLs externas en el navegador del sistema
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Manejar cierre de la ventana principal
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Mostrar pantalla de carga mientras los servidores arrancan
  mainWindow.loadURL('data:text/html,<html><body style="background:#0a0a0a;color:#10b981;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h1>PASK Stocks</h1><p>Iniciando servidores...</p><p style="font-size:12px;color:#666;margin-top:20px;">Cargando Next.js y Python backend...</p></div></body></html>');

  try {
    // Esperar a que Next.js esté listo
    console.log('[Electron] Esperando a que Next.js esté listo...');
    await waitForServer('http://localhost:3000', 60000);
    
    // También esperar al backend Python
    console.log('[Electron] Esperando a que el backend Python esté listo...');
    await waitForServer('http://localhost:8000/docs', 30000).catch(() => {
      console.log('[Electron] Backend Python no responde, continuando de todos modos...');
    });
    
    // Verificar que la ventana aún existe antes de cargar
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Electron] Servidores listos, cargando aplicación...');
      mainWindow.loadURL('http://localhost:3000');
    } else {
      console.log('[Electron] Ventana cerrada antes de que los servidores estuvieran listos');
    }
  } catch (e) {
    console.error('[Electron] Error esperando servidores:', e);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL('data:text/html,<html><body style="background:#0a0a0a;color:#ef4444;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h1>Error</h1><p>No se pudo conectar con el servidor. Revisa la consola.</p><p style="font-size:12px;margin-top:10px;">Ejecuta la app con: npm run electron</p></div></body></html>');
    }
  }
}

// Manejar el proceso de cerrar los subprocesos de forma más robusta
function killProcessTree(proc) {
  if (!proc) return;
  
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true });
    } else {
      // En Unix/Mac, matar el grupo de procesos
      process.kill(-proc.pid, 'SIGTERM');
    }
  } catch (e) {
    // Si falla el kill del grupo, intentar kill normal
    try {
      proc.kill('SIGTERM');
    } catch (e2) {
      console.error('[Electron] Error matando proceso:', e2);
    }
  }
}

app.whenReady().then(async () => {
  // Primero liberar puertos que puedan estar ocupados
  killPortProcesses();
  
  startPythonBackend();
  startNextDev();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  console.log('[Electron] Cerrando procesos antes de salir...');
  killProcessTree(pythonProcess);
  killProcessTree(nextProcess);
});

app.on('will-quit', () => {
  console.log('[Electron] Cerrando procesos...');
  killProcessTree(pythonProcess);
  killProcessTree(nextProcess);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
