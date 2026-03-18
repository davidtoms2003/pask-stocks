# Configuración de NotebookLM

## Autenticación Persistente (Recomendado)

Para usar NotebookLM sin problemas de expiración de sesión, sigue estos pasos:

### 1. Ejecuta el script de configuración

Desde la raíz del proyecto:

```bash
python3 backend/setup_notebooklm.py
```

### 2. Inicia sesión en tu navegador

El script abrirá automáticamente tu navegador. Debes:
- Iniciar sesión con tu cuenta de Google
- Esperar a que cargue la página de NotebookLM
- Cerrar la ventana del navegador

### 3. ¡Listo!

Las credenciales se guardan en `~/.notebooklm/storage_state.json` y se renuevan automáticamente.

## ¿Por qué este método?

- ✅ **No expira**: Las cookies se refrescan automáticamente
- ✅ **Persistente**: Sobrevive a reinicios del servidor
- ✅ **Seguro**: Usa el sistema de autenticación oficial de la librería
- ✅ **Simple**: Solo necesitas configurarlo una vez

## Solución de problemas

### "Authentication expired or invalid"

Si ves este error, significa que necesitas volver a autenticarte:

```bash
python3 backend/setup_notebooklm.py
```

**Importante:** Si usas `npm run dev:backend` con hot-reload, la sesión se reiniciará con cada cambio de código. Para evitar esto:
- Usa `npm run electron` (recomendado) - sin hot-reload, sesión persistente
- O edita código en archivos que no sean del backend mientras desarrollas

### El script no abre el navegador

Asegúrate de tener instaladas las dependencias completas:

```bash
cd backend
pip install -r requirements.txt
```

### Crear el notebook "PASK stocks" manualmente

Si el script no lo crea automáticamente:
1. Ve a [notebooklm.google.com](https://notebooklm.google.com)
2. Crea un nuevo notebook
3. Nómbralo exactamente: **PASK stocks**

## Método alternativo (No recomendado)

El método de cookies manuales via EditThisCookie está deprecado porque:
- ❌ Las cookies expiran cada pocas horas
- ❌ Requiere reconfiguración constante
- ❌ Propenso a errores

Si aún así quieres usarlo, ve a Settings > NotebookLM Conexión > "Método alternativo".
