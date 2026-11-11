import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Lazy initialize Gemini client
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Helper: Call Gemini with retry and fallback model
  const generateWithRetry = async (ai: GoogleGenAI, contents: string, temperature = 0.2) => {
    const models = ['gemini-3.7-flash', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: 'application/json',
              temperature,
            },
          });
          if (response && response.text) {
            return JSON.parse(response.text);
          }
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.code || (err?.message && err.message.includes('503') ? 503 : 0);
          if (status === 503 || status === 429) {
            // Wait 500ms before retrying or switching model
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          break; // For other errors, try next model
        }
      }
    }
    throw lastError || new Error('Model temporarily unavailable');
  };

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: Git repository status & metadata
  app.get('/api/git/info', async (req, res) => {
    try {
      await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', __dirname]).catch(() => {});
      await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', '/app/applet']).catch(() => {});
      await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', '*']).catch(() => {});
      if (!fs.existsSync(path.join(__dirname, '.git'))) {
        await execAsync('git init && git config user.name "Lucas Rodriguez" && git config user.email "lucasrdzlr@gmail.com" && git branch -M main').catch(() => {});
      }
      const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD').catch(() => ({ stdout: 'main\n' }));
      const { stdout: lastCommit } = await execAsync('git log -1 --pretty=format:"%h - %s (%ci)"').catch(() => ({ stdout: 'Initial commit\n' }));
      const { stdout: rawRemoteOrigin } = await execAsync('git remote get-url origin').catch(() => ({ stdout: 'https://github.com/lucasrdzlr-hash/Miner.git\n' }));
      const cleanRemoteOrigin = rawRemoteOrigin.trim().replace(/https:\/\/[^@]+@github\.com/, 'https://github.com');
      const zipPath = path.join(__dirname, 'public', 'download', 'prisma-akme-latest.zip');
      const zipExists = fs.existsSync(zipPath);
      let zipSizeMb = '0 MB';
      if (zipExists) {
        const stats = fs.statSync(zipPath);
        zipSizeMb = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';
      }

      res.json({
        branch: branch.trim() || 'main',
        lastCommit: lastCommit.trim() || 'Initial commit',
        remoteOrigin: cleanRemoteOrigin,
        zipAvailable: zipExists,
        zipSize: zipSizeMb,
        downloadUrl: '/download/prisma-akme-latest.zip',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error consultando git' });
    }
  });

  // API: Generate fresh ZIP archive of the entire codebase
  app.post('/api/git/generate-zip', async (req, res) => {
    try {
      await execAsync('python3 scripts/create-zip.py');
      const zipPath = path.join(__dirname, 'public', 'download', 'prisma-akme-latest.zip');
      const stats = fs.statSync(zipPath);
      res.json({
        success: true,
        message: 'Archivo ZIP generado correctamente con el código fuente completo y módulos del sistema PRISMA',
        downloadUrl: '/download/prisma-akme-latest.zip',
        sizeMb: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error generando archivo ZIP' });
    }
  });

  // API: Export complete project archive as ZIP for historical enterprise retention
  app.post('/api/projects/archive-zip', async (req, res) => {
    try {
      const { project } = req.body;
      if (!project || !project.code) {
        return res.status(400).json({ error: 'Datos de obra inválidos.' });
      }

      const tempDir = path.join(__dirname, 'public', 'download');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const sanitizedCode = String(project.code).replace(/[^a-zA-Z0-9_-]/g, '_');
      const zipFileName = `PRISMA_Archivo_Obra_${sanitizedCode}.zip`;
      const zipFilePath = path.join(tempDir, zipFileName);
      const pyTempPath = path.join(tempDir, `pack_${sanitizedCode}_${Date.now()}.py`);
      const jsonTempPath = path.join(tempDir, `temp_${sanitizedCode}_${Date.now()}.json`);

      // Write temp json file
      fs.writeFileSync(jsonTempPath, JSON.stringify(project, null, 2), 'utf8');

      const pyScript = `
import zipfile, json, os

json_file = r'${jsonTempPath.replace(/\\/g, '/')}'
zip_path = r'${zipFilePath.replace(/\\/g, '/')}'

with open(json_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

code = data.get('code', 'OBRA')

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr(f'{code}_Datos_Completos.json', json.dumps(data, indent=2, ensure_ascii=False))
    items = data.get('budgetItems', [])
    csv_lines = ['ID_Item,Rubro,Nombre,Unidad,Cantidad,Costo_Directo_Unitario,Precio_Unitario,Precio_Total,Avance_Porc']
    for it in items:
        csv_lines.append(f'"{it.get("id","")}","{it.get("category","")}","{it.get("name","")}","{it.get("unit","")}",{it.get("quantity",0)},{it.get("directCostUnit",0)},{it.get("unitPrice",0)},{it.get("totalPrice",0)},{it.get("progress",0)}')
    z.writestr(f'{code}_Presupuesto_Computo.csv', '\\n'.join(csv_lines))
    
    manifest = f"""PRISMA by AKME - ARCHIVO HISTORICO DE OBRA
===============================================
Codigo: {data.get('code')}
Nombre: {data.get('name')}
Cliente: {data.get('client')}
Estado: {data.get('status')}
Moneda: {data.get('currency')}
Partidas Computadas: {len(items)}
Tareas de Cronograma: {len(data.get('scheduleTasks', []))}
Partes Diarios: {len(data.get('dailyLogs', []))}
Gastos Registrados: {len(data.get('expenses', []))}
"""
    z.writestr(f'{code}_FICHA_TECNICA.txt', manifest)

if os.path.exists(json_file):
    os.remove(json_file)
`;

      fs.writeFileSync(pyTempPath, pyScript, 'utf8');
      await execAsync(`python3 "${pyTempPath}"`);
      if (fs.existsSync(pyTempPath)) fs.unlinkSync(pyTempPath);
      if (fs.existsSync(jsonTempPath)) fs.unlinkSync(jsonTempPath);

      res.json({
        success: true,
        downloadUrl: `/download/${zipFileName}`,
        filename: zipFileName,
      });
    } catch (err: any) {
      console.error('Error generating project archive zip:', err);
      res.status(500).json({ error: err.message || 'Error al empaquetar el archivo ZIP' });
    }
  });

  // API: Push current code directly to user GitHub repo
  app.post('/api/git/push', async (req, res) => {
    const {
      repoUrl,
      githubToken,
      branch = 'main',
      commitMessage = 'feat: actualizacion integral del sistema PRISMA y sincronizacion'
    } = req.body;

    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: 'La URL del repositorio de GitHub es requerida.' });
    }

    const cleanToken = typeof githubToken === 'string' ? githubToken.trim() : '';

    // Validate token format if user entered something
    if (cleanToken) {
      // If user pasted an error message or invalid string
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanToken) || cleanToken.toLowerCase().includes('fatal') || cleanToken.includes(' ')) {
        return res.status(400).json({
          error: 'El token ingresado no es válido. Debe ser un GitHub Personal Access Token (PAT) alfanumérico (ej: ghp_... o github_pat_...). Has pegado un texto erróneo en el campo de Token.'
        });
      }
    }

    try {
      // 0. Ensure safe.directory is configured and git is initialized
      await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', __dirname]).catch(() => {});
      await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', '/app/applet']).catch(() => {});
      await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', '*']).catch(() => {});

      if (!fs.existsSync(path.join(__dirname, '.git'))) {
        await execFileAsync('git', ['init']);
        await execFileAsync('git', ['branch', '-M', 'main']);
      }
      await execFileAsync('git', ['config', 'user.name', 'Lucas Rodriguez']).catch(() => {});
      await execFileAsync('git', ['config', 'user.email', 'lucasrdzlr@gmail.com']).catch(() => {});
      await execFileAsync('git', ['config', 'http.postBuffer', '524288000']).catch(() => {});
      await execFileAsync('git', ['config', 'http.version', 'HTTP/1.1']).catch(() => {});
      await execFileAsync('git', ['config', 'http.lowSpeedLimit', '0']).catch(() => {});
      await execFileAsync('git', ['config', 'http.lowSpeedTime', '999999']).catch(() => {});

      // 1. Stage all pending changes
      await execFileAsync('git', ['add', '.']);

      // 2. Commit if there are staged changes
      try {
        await execFileAsync('git', ['commit', '-m', String(commitMessage || 'feat: actualizacion de obra y sistema')]);
      } catch (commitErr) {
        // Nothing to commit is fine
      }

      // 3. Format authenticated URL if token provided
      let authUrl = repoUrl.trim();
      let sanitizedUrl = repoUrl.trim();

      if (cleanToken) {
        // Match https://github.com/user/repo or https://github.com/user/repo.git
        if (authUrl.startsWith('https://github.com/')) {
          authUrl = authUrl.replace('https://github.com/', `https://${cleanToken}@github.com/`);
        } else if (authUrl.startsWith('http://github.com/')) {
          authUrl = authUrl.replace('http://github.com/', `https://${cleanToken}@github.com/`);
        } else if (!authUrl.includes('@')) {
          authUrl = `https://${cleanToken}@${authUrl.replace(/^https?:\/\//, '')}`;
        }
      }

      // Ensure .git suffix
      if (!authUrl.endsWith('.git')) {
        authUrl += '.git';
      }

      const targetBranch = (branch || 'main').trim();

      // 4. Configure remote safely using execFile (no shell expansion or parenthesis issues)
      await execFileAsync('git', ['remote', 'remove', 'origin']).catch(() => {});
      await execFileAsync('git', ['remote', 'add', 'origin', authUrl]);
      await execFileAsync('git', ['branch', '-M', targetBranch]);

      // Fetch remote objects to ensure common ancestor graph and avoid full pack rebuild timeouts
      await execFileAsync('git', ['fetch', 'origin', targetBranch]).catch(() => {});

      // 5. Push to GitHub
      const { stdout, stderr } = await execFileAsync('git', ['push', '-u', 'origin', targetBranch, '--force']);

      // 6. Sanitize remote URL in git config so token is not left exposed
      if (sanitizedUrl) {
        if (!sanitizedUrl.endsWith('.git')) sanitizedUrl += '.git';
        await execFileAsync('git', ['remote', 'set-url', 'origin', sanitizedUrl]).catch(() => {});
      }

      res.json({
        success: true,
        message: `¡Código subido exitosamente a la rama '${targetBranch}' de tu repositorio GitHub!`,
        details: stdout || stderr || 'Operación completada sin errores.',
      });
    } catch (pushErr: any) {
      console.error('Git push error:', pushErr);
      const errMsg = pushErr?.stderr || pushErr?.message || String(pushErr);
      let userFriendlyHint = 'Verifica que la URL del repositorio exista y tengas permisos de escritura.';
      if (errMsg.includes('Authentication') || errMsg.includes('403') || errMsg.includes('denied') || errMsg.includes('Invalid username or password')) {
        userFriendlyHint = 'Error de autenticación con GitHub. Verifica que tu Personal Access Token (PAT) sea correcto, que no haya expirado y que tenga permiso de "repo" o "contents:write".';
      } else if (errMsg.includes('408') || errMsg.includes('RPC failed')) {
        userFriendlyHint = 'La conexión con GitHub experimentó un tiempo de espera (HTTP 408 Timeout). El búfer de transmisión de Git (500MB) y HTTP/1.1 han sido optimizados. Por favor vuelve a hacer clic en "Subir Código a GitHub Ahora".';
      }

      res.status(500).json({
        error: 'Falló el git push hacia GitHub.',
        details: errMsg,
        hint: userFriendlyHint,
      });
    }
  });

  // API: AI APU Generator / Assistant (Drilling, Mining & Energy)
  app.post('/api/ai/suggest-apu', async (req, res) => {
    const { itemName, category, description, unit, countryContext } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como un Ingeniero de Perforación, Minería y Energía Senior especialista en Cómputos y Análisis de Precios Unitarios (APU) para Campañas de Perforación (Diamantina DDH, Aire Reverso RC, Rotaria, Pozos de Agua/Litio/Geotermia y Montaje Electromecánico).
Genera un desglose detallado de Análisis de Precios Unitarios para el siguiente ítem:
- Nombre del Ítem: "${itemName || 'Perforación Diamantina HQ con Recuperación de Testigo'}"
- Rubro/Capítulo: "${category || 'Perforación Diamantina & Pozos'}"
- Unidad de Medida: "${unit || 'm'}"
- Descripción / Especificación: "${description || 'Perforación diamantina línea HQ en roca consolidada, incluyendo coronas impregnadas, lodos bentoníticos, sonda hidráulica y dotación en turno 14x14'}"
- Contexto Regional: "${countryContext || 'Puna / Cuenca Andina / USD'}"

Debes devolver obligatoriamente un JSON válido con la siguiente estructura exacta:
{
  "code": "APU-PERF-XX",
  "name": "Nombre descriptivo exacto",
  "category": "Nombre del rubro (ej. Perforación Diamantina, Entubado Casing, Lodos e Inyección, Montaje Electromecánico)",
  "unit": "Unidad (m, m3, un, glb, hm)",
  "description": "Especificación técnica de perforación/montaje y método operativo",
  "materials": [
    { "name": "Nombre de insumo (ej. Corona Diamantada HQ / Bentonita API / Casing J55)", "unit": "un, bolsa, m o kg", "yieldRatio": 0.04, "wastePercent": 5, "unitPrice": 680.0 }
  ],
  "labor": [
    {
      "role": "Jefe de Equipo / Perforista / Ayudante Boca de Pozo / Inyeccionista / Montador Electromecánico",
      "unit": "hh",
      "yieldRatio": 1.25,
      "hourlyRate": 14.5,
      "socialChargesPercent": 52,
      "shiftRegime": "14x14",
      "zoneAllowancePercent": 35,
      "campCostPerDay": 65
    }
  ],
  "equipment": [
    {
      "name": "Nombre de equipo/sonda (ej. Perforadora Diamantina LF-90D / Bomba Triplex / Grupo Electrógeno)",
      "unit": "hm",
      "yieldRatio": 0.45,
      "runningRate": 95.0,
      "standbyRate": 42.0,
      "standbyHoursRatio": 0.12,
      "dieselConsumptionLph": 28.0,
      "dieselPricePerLiter": 1.18,
      "hourlyRate": 133.08
    }
  ],
  "overheadPercent": 18,
  "profitPercent": 12,
  "taxPercent": 21,
  "tips": ["Consejo operativo de perforación, control de lodos o entubado"]
}

Sé técnicamente riguroso con los rendimientos reales de perforación minera/energética, tarifas Running vs Stand-by, consumo horario de gasoil (L/h) y regímenes de campo 14x14 o 21x7.
Devuelve SOLO el JSON sin texto markdown adicional.`;

      const parsed = await generateWithRetry(ai, prompt, 0.2);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for Drilling/Mining APU generation:', error?.message || error);
      res.json({
        success: true,
        fallback: true,
        data: {
          code: 'APU-PERF-GEN',
          name: itemName || 'Perforación Rotaria / Diamantina en Formación Consolidada',
          category: category || 'Perforación & Pozos',
          unit: unit || 'm',
          description: description || `Ejecución de ${itemName || 'perforación de pozo y acondicionamiento'} con control de verticalidad, circulación de fluido bentonítico y registro de parámetros operativos.`,
          materials: [
            { name: 'Corona Diamantada Impregnada / Trépano Tricónico Insertos Tungsteno', unit: 'un', yieldRatio: 0.035, wastePercent: 3, unitPrice: 820.0 },
            { name: 'Bentonita Sódica Grado API (bolsa 25kg)', unit: 'bolsa', yieldRatio: 0.85, wastePercent: 6, unitPrice: 18.5 },
            { name: 'Polímero Viscosificante y Reductor de Filtrado PHPA', unit: 'kg', yieldRatio: 0.45, wastePercent: 5, unitPrice: 9.8 },
            { name: 'Grasa para Roscas de Barras de Sondeo (Cobre/Zinc)', unit: 'kg', yieldRatio: 0.12, wastePercent: 5, unitPrice: 16.0 },
          ],
          labor: [
            { role: 'Perforista Principal Sonda (DDH / Rotaria)', unit: 'hh', yieldRatio: 0.65, hourlyRate: 16.5, socialChargesPercent: 52, shiftRegime: '14x14', zoneAllowancePercent: 35, campCostPerDay: 68 },
            { role: 'Ayudante de Boca de Pozo / Maniobras', unit: 'hh', yieldRatio: 1.30, hourlyRate: 11.2, socialChargesPercent: 52, shiftRegime: '14x14', zoneAllowancePercent: 35, campCostPerDay: 68 },
            { role: 'Inyeccionista / Control de Lodos', unit: 'hh', yieldRatio: 0.65, hourlyRate: 13.8, socialChargesPercent: 52, shiftRegime: '21x7', zoneAllowancePercent: 35, campCostPerDay: 68 },
          ],
          equipment: [
            { name: 'Sonda Perforadora Hidráulica (Mástil 18m / 450 HP)', unit: 'hm', yieldRatio: 0.55, runningRate: 115.0, standbyRate: 52.0, standbyHoursRatio: 0.15, dieselConsumptionLph: 34.0, dieselPricePerLiter: 1.18, hourlyRate: 162.92 },
            { name: 'Bomba de Lodos Triplex de Alta Presión', unit: 'hm', yieldRatio: 0.55, runningRate: 28.0, standbyRate: 12.0, standbyHoursRatio: 0.15, dieselConsumptionLph: 9.5, dieselPricePerLiter: 1.18, hourlyRate: 41.01 },
          ],
          overheadPercent: 18,
          profitPercent: 12,
          taxPercent: 21,
          tips: [
            'Monitorear continuamente la viscosidad Marsh (45-55 seg) y densidad del lodo bentonítico para evitar colapso de paredes en estratos aluviales.',
            'Registrar horas operativas (Running) vs horas en espera (Stand-by por fraguado o perfilaje) en el parte diario de sonda.',
          ],
        },
      });
    }
  });

  // API: AI Weather & Critical Path Schedule Advisor (Drilling, Mining & Energy)
  app.post('/api/ai/analyze-schedule-weather', async (req, res) => {
    const { tasks, weatherForecast, projectName } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Director de Operaciones de Perforación (Company Man) y Jefe de Planificación en Minería y Energía.
Analiza la siguiente jornada de campaña y pronóstico meteorológico para la campaña "${projectName || 'Campaña de Perforación'}":

Actividades de pozos y frentes programadas en la ruta crítica:
${JSON.stringify(tasks, null, 2)}

Pronóstico meteorológico previsto en locación/yacimiento:
${JSON.stringify(weatherForecast, null, 2)}

Analiza:
1. Riesgos climáticos directos para las operaciones (ej. Viento blanco / ráfagas > 50 km/h vs Izaje de barras en mástil de sonda, entubado de Casing y grúas; Bajas temperaturas extremas vs congelamiento de líneas de agua/lodos y fraguado de cementación anular; Tormentas eléctricas vs parada obligatoria de torre metálica).
2. Impacto en horas de Stand-by de equipos (tarifa de espera) y consumo de gasoil para calefacción/mantenimiento de circulación.
3. Recomendaciones operativas accionables para los Jefes de Campo y Perforistas.

Devuelve obligatoriamente un JSON válido:
{
  "generalRiskLevel": "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO",
  "summary": "Resumen ejecutivo del impacto climático en las sondas y frentes en 2-3 oraciones",
  "taskImpacts": [
    {
      "taskName": "Nombre de la actividad o pozo",
      "critical": true,
      "risk": "Descripción del riesgo operativo en plataforma/pozo",
      "severity": "ALTO" | "MEDIO" | "BAJO",
      "actionRecommendation": "Acción inmediata recomendada (circular lodo en stand-by, traceado térmico, suspender izaje de casing, etc.)"
    }
  ],
  "criticalPathAlert": "Alerta sobre el plazo de campaña e impacto en horas Stand-by de equipos",
  "contingencyPlan": ["Paso 1", "Paso 2", "Paso 3"]
}

Devuelve SOLO el JSON sin texto markdown.`;

      const parsed = await generateWithRetry(ai, prompt, 0.3);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for Weather & Drilling Schedule analysis:', error?.message || error);
      res.json({
        success: true,
        fallback: true,
        data: {
          generalRiskLevel: 'MEDIO',
          summary: `Se prevén ráfagas de viento e inestabilidad térmica en las plataformas de ${projectName || 'la campaña'}. Se recomienda controlar maniobras de torre e izaje de tubería casing para minimizar horas improductivas (Stand-by).`,
          taskImpacts: [
            {
              taskName: 'Maniobras de Sondeo e Izaje de Barras / Entubado Casing',
              critical: true,
              risk: 'Ráfagas superiores a 45 km/h comprometen la estabilidad del operario en plataforma de torre y el alineamiento de tramos de Casing API.',
              severity: 'ALTO',
              actionRecommendation: 'Continuar perforación rotaria/diamantina con sarta en el pozo y postergar sacada de herramienta o entubado a las ventanas de menor viento.',
            },
            {
              taskName: 'Circulación de Lodos Bentoníticos y Bombas Triplex',
              critical: true,
              risk: 'Descenso térmico nocturno bajo cero puede congelar mangueras de succión y líneas de retorno desde piletas de inyección.',
              severity: 'MEDIO',
              actionRecommendation: 'Mantener recirculación mínima continua en piletas y drenar líneas superficiales durante paradas de turno.',
            },
            {
              taskName: 'Montaje Electromecánico de Cabezal y Manifold',
              critical: false,
              risk: 'Precipitaciones y polvo en suspensión afectan soldaduras de línea API y conexionado de tableros VFD.',
              severity: 'MEDIO',
              actionRecommendation: 'Instalar carpas estructurales de protección en boca de pozo para dar continuidad a los soldadores y montadores.',
            },
          ],
          criticalPathAlert: 'La ruta crítica de perforación en Pozo DDH-01 mantiene margen operativo, pero superar 8 horas de parada climática activará tarifa Stand-by en las sondas.',
          contingencyPlan: [
            'Verificar stock mínimo de 7 días de gasoil grado 3 con aditivo anticongelante en tanques cisterna del campamento.',
            'Mantener rotación lenta y circulación en fondo de pozo ante alertas de viento para evitar aprisionamiento de barras.',
            'Asegurar comunicación VHF/Satelital entre Plataformas Norte/Central y la Base de Campamento antes del relevo de turno.',
          ],
        },
      });
    }
  });

  // API: AI Gantt Schedule & Resource Simulation Advisor (Drilling, Mining & Energy)
  app.post('/api/ai/simulate-gantt-schedule', async (req, res) => {
    const {
      projectName,
      simulationMode,
      parameters,
      baselineSummary,
      simulatedSummary,
      sampleTasks,
    } = req.body;

    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Gerente de Operaciones de Perforación, Minería y Energía (Especialista en Planificación de Campañas de Sondaje y Proyectos EPC).
Analiza la siguiente simulación de cronograma de campaña, dotación por regímenes de turno (14x14 / 21x7) y flota de equipos para "${projectName || 'Campaña en Ejecución'}":

MODO DE SIMULACIÓN SELECCIONADO: ${
        simulationMode === 'deadline'
          ? 'POR FECHA META DE CAMPAÑA (Incorporación de Sondas / Doble Turno 24h para acortar plazo)'
          : simulationMode === 'fixed_crew'
          ? 'POR DOTACIÓN Y FLOTA FIJA (Secuenciación de Pozos según disponibilidad de Sondas)'
          : 'MODO ÓPTIMO COSTO-TARIFA RUNNING vs STAND-BY (Fast-Tracking de Plataformas)'
      }

PARÁMETROS DE LA SIMULACIÓN:
${JSON.stringify(parameters || {}, null, 2)}

COMPARATIVA RESUMEN (LÍNEA BASE vs SIMULACIÓN):
- Línea Base Original: Inicio ${baselineSummary?.startDate}, Fin ${baselineSummary?.endDate}, Duración ${baselineSummary?.totalWorkingDays} días operativos, Pico Dotación ${baselineSummary?.peakWorkers} especialistas, Costo M.O. Campamento $${baselineSummary?.totalLaborCost}
- Escenario Simulado: Inicio ${simulatedSummary?.startDate}, Fin ${simulatedSummary?.endDate}, Duración ${simulatedSummary?.totalWorkingDays} días operativos, Variación ${simulatedSummary?.daysDelta > 0 ? '+' : ''}${simulatedSummary?.daysDelta} días, Pico Dotación ${simulatedSummary?.peakWorkers} especialistas, Costo M.O. $${simulatedSummary?.totalLaborCost}, Variación Costo $${simulatedSummary?.costDelta}

ACTIVIDADES DE POZOS Y FRENTES DEL CRONOGRAMA:
${JSON.stringify(sampleTasks || [], null, 2)}

INSTRUCCIONES DE ANÁLISIS:
1. Evalúa la VIABILIDAD TÉCNICA en terreno (tasa de penetración ROP m/día, disponibilidad mecánica de sondas, tiempos de fraguado de cementación de casing y logística de gasoil/agua industrial).
2. Identifica CUELLOS DE BOTELLA (movimiento de sondas entre plataformas, espera de perfilaje geofísico que genera horas Stand-by, capacidad de alojamiento en campamento para regímenes 14x14 y 21x7).
3. Recomienda el PLAN DE DOTACIÓN Y DIAGRAMAS DE TURNO (Perforistas, Ayudantes de Boca de Pozo, Inyeccionistas y Montadores Electromecánicos).
4. Emite 3 RECOMENDACIONES OPERATIVAS ACCIONABLES para reducir horas Stand-by y optimizar el consumo de gasoil.

Debes devolver obligatoriamente un JSON válido:
{
  "feasibilityScore": "ALTA" | "MEDIA" | "BAJA",
  "executiveVerdict": "Dictamen ejecutivo sobre la viabilidad de la campaña en 2-3 oraciones",
  "bottlenecks": [
    {
      "area": "Nombre del pozo, sonda o frente",
      "description": "Explicación del cuello de botella operativo",
      "mitigation": "Estrategia para resolverlo en campo"
    }
  ],
  "resourceDemands": [
    {
      "role": "Perforista Principal / Ayudante de Sonda / Inyeccionista / Montador Electromecánico",
      "peakNeeded": 6,
      "recommendation": "Pauta de rotación (14x14 o 21x7) y asignación de cuadrilla"
    }
  ],
  "risks": [
    {
      "risk": "Riesgo geotécnico, mecánico o de plazo",
      "impact": "ALTO" | "MEDIO" | "BAJO",
      "action": "Medida preventiva de control"
    }
  ],
  "recommendations": [
    "Recomendación 1",
    "Recomendación 2",
    "Recomendación 3"
  ]
}

Devuelve SOLO el JSON sin texto markdown.`;

      const parsed = await generateWithRetry(ai, prompt, 0.25);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for Drilling Gantt simulation:', error?.message || error);

      const isDeadlineMode = simulationMode === 'deadline';
      const daysDelta = simulatedSummary?.daysDelta || 0;
      const peakWorkers = simulatedSummary?.peakWorkers || 12;

      res.json({
        success: true,
        fallback: true,
        data: {
          feasibilityScore: Math.abs(daysDelta) > 45 ? 'MEDIA' : 'ALTA',
          executiveVerdict: isDeadlineMode
            ? `El escenario acelerado permite reducir ${Math.abs(daysDelta)} días operando las sondas en doble turno continuo (24 hs) bajo diagrama 14x14 (${peakWorkers} operarios en pico). Reduce la incidencia de costos fijos de campamento por metro perforado.`
            : `El escenario con flota y dotación nivelada optimiza el traslado secuencial de la sonda entre los pozos DDH-01, DDH-02 y RC-03, minimizando cargos de Stand-by de equipos y evitando saturar la capacidad del campamento.`,
          bottlenecks: [
            {
              area: 'Desmontaje, Traslado (DTM) y Montaje entre Plataformas',
              description: isDeadlineMode
                ? 'La operación simultánea de múltiples frentes exige disponer de camión grúa y cisternas de agua/lodos dedicados para no generar horas Stand-by en las perforadoras.'
                : 'El tiempo de mudanza de sonda (DTM) y nivelación de subestructura puede demorar el inicio del siguiente pozo si el Pad no está liberado.',
              mitigation: isDeadlineMode
                ? 'Construir e impermeabilizar las piletas de lodos del siguiente pozo con 5 días de anticipación al arribo de la sonda.'
                : 'Pre-instalar conductos guía y bodegas de boca de pozo antes de finalizar el perfilaje del pozo anterior.',
            },
            {
              area: 'Cementación de Casing y Espera de Fraguado (WOC)',
              description: 'El tiempo tecnológico de fraguado del cemento anular (18 a 24 hs) mantiene la sonda en tarifa Stand-by.',
              mitigation: 'Utilizar acelerantes de fraguado (CaCl2 al 2%) aprobados por geología y aprovechar la ventana WOC para mantenimiento preventivo de bombas Triplex.',
            },
          ],
          resourceDemands: [
            {
              role: 'Perforista Principal (Turnos 14x14 - Día/Noche)',
              peakNeeded: Math.max(2, Math.ceil(peakWorkers * 0.25)),
              recommendation: 'Asignar 2 perforistas por sonda activa por turno activo más su contraparte de relevo 14x14.',
            },
            {
              role: 'Ayudante de Boca de Pozo & Inyeccionista',
              peakNeeded: Math.max(4, Math.ceil(peakWorkers * 0.5)),
              recommendation: 'Mantener cuadrilla completa en boca de pozo para agilizar maniobras de sacada de testigo (Wireline) y preparación de bentonita.',
            },
            {
              role: 'Oficial Montador Electromecánico & Soldador API (21x7)',
              peakNeeded: Math.max(2, Math.ceil(peakWorkers * 0.25)),
              recommendation: 'Ingresar en la mitad de la campaña cuando el primer pozo haya completado el entubado y desarrollo para montar cabezales y manifold.',
            },
          ],
          risks: [
            {
              risk: 'Pérdida de circulación en estratos fracturados o aluviales',
              impact: 'ALTO',
              action: 'Disponer en plataforma de stock crítico de obturantes (fibra celulósica, mica y bentonita de alto rendimiento) para sellar zonas permeables.',
            },
            {
              risk: isDeadlineMode ? 'Sobrecosto por horas Stand-by y consumo pico de gasoil' : 'Extensión de campaña hacia temporada climática adversa',
              impact: 'MEDIO',
              action: isDeadlineMode
                ? 'Auditar diariamente el ratio Horas Running / Horas Stand-by por equipo y el consumo específico de gasoil (L/hm).'
                : 'Priorizar los pozos de mayor cota topográfica antes del ingreso del invierno.',
            },
          ],
          recommendations: [
            isDeadlineMode
              ? 'Sincronizar los cambios de guardia del régimen 14x14 los días miércoles para no detener ambas sondas el mismo día.'
              : 'Mantener la misma dupla Perforista-Inyeccionista a lo largo de toda la campaña para maximizar la tasa de penetración (ROP).',
            'Implementar control de telemetría de consumo de gasoil por hora operativa (Running) en generadores y perforadoras.',
            'Coordinar el camión de perfilaje geofísico 48 hs antes de alcanzar la profundidad final (TD) de cada pozo para eliminar horas de espera.',
          ],
        },
      });
    }
  });

  // API: AI Drilling & Energy Campaign Logical Sequencing & Cascade
  app.post('/api/ai/sequence-gantt-tasks', async (req, res) => {
    const {
      projectName,
      sequenceMode,
      tasks = [],
    } = req.body;

    const categorizeDrillingPhase = (desc: string, cat: string) => {
      const text = `${desc} ${cat}`.toLowerCase();
      if (text.includes('locaci') || text.includes('pad') || text.includes('plataforma') || text.includes('pileta') || text.includes('movilizac') || text.includes('dtm') || text.includes('campamento') || text.includes('preliminar')) {
        return { phaseOrder: 1, phaseName: '1. Apertura de Plataforma (Pad), Piletas de Lodos & DTM Sonda', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('guia') || text.includes('conductor') || text.includes('superficial') || text.includes('aluvion') || text.includes('tramo i')) {
        return { phaseOrder: 2, phaseName: '2. Perforación de Tramo Guía Superficial & Sello Sanitario', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('lodo') || text.includes('bentonit') || text.includes('inyecc') || text.includes('fluido') || text.includes('polimer')) {
        return { phaseOrder: 3, phaseName: '3. Ingeniería e Inyección de Lodos Bentoníticos', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('diamantin') || text.includes('rotaria') || text.includes('ddh') || text.includes('rc') || text.includes('perforac') || text.includes('testigo') || text.includes('pozo')) {
        return { phaseOrder: 4, phaseName: '4. Perforación Profunda (Diamantina HQ/NQ & Rotaria)', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('perfilaj') || text.includes('geofisic') || text.includes('gamma') || text.includes('logueo') || text.includes('caliper')) {
        return { phaseOrder: 5, phaseName: '5. Perfilaje Geofísico de Pozo & Logueo Geotécnico', priority: 'media' as const, isCritical: true };
      }
      if (text.includes('casing') || text.includes('entubad') || text.includes('cementac') || text.includes('filtro') || text.includes('engranzad') || text.includes('revestimiento')) {
        return { phaseOrder: 6, phaseName: '6. Entubado de Casing Acero API, Filtros & Cementación Anular', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('desarrollo') || text.includes('aforo') || text.includes('ensayo') || text.includes('bombeo') || text.includes('airlift')) {
        return { phaseOrder: 7, phaseName: '7. Limpieza, Desarrollo por Air-Lift & Ensayo de Bombeo', priority: 'media' as const, isCritical: true };
      }
      if (text.includes('electromecanic') || text.includes('cabezal') || text.includes('wellhead') || text.includes('manifold') || text.includes('tablero') || text.includes('bomba electrosumergible') || text.includes('montaje')) {
        return { phaseOrder: 8, phaseName: '8. Montaje Electromecánico de Cabezal, Manifold & Bombeo', priority: 'media' as const, isCritical: true };
      }
      if (text.includes('desmoviliz') || text.includes('remediac') || text.includes('cierre') || text.includes('entrega')) {
        return { phaseOrder: 9, phaseName: '9. remediación Ambiental de Plataforma & Desmovilización', priority: 'baja' as const, isCritical: true };
      }
      return { phaseOrder: 4.5, phaseName: 'Fase Operativa de Campaña', priority: 'media' as const, isCritical: false };
    };

    try {
      const ai = getGeminiClient();
      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Jefe de Planificación de Campañas de Perforación, Minería y Energía.
Ordena la siguiente lista de partidas en la SECUENCIA TÉCNICA OPERATIVA CORRECTA de una campaña de perforación y montaje electromecánico:
1. Apertura de Plataforma (Pad), Piletas de Lodos y Movilización (DTM)
2. Perforación Guía Superficial
3. Preparación e Inyección de Lodos Bentoníticos
4. Perforación Profunda (Diamantina HQ/NQ o Rotaria)
5. Perfilaje Geofísico (Gamma Ray / Resistividad)
6. Entubado de Casing API y Cementación Anular
7. Desarrollo de Pozo y Ensayos Hidráulicos
8. Montaje Electromecánico (Cabezal Wellhead, Bombas BES, Manifold y Tableros)
9. Remediación de Locación y Desmovilización.

Modo Solicitado: ${sequenceMode || 'construction_phases'}
Campaña: "${projectName || 'Campaña de Perforación'}"
Tareas:
${JSON.stringify(tasks.map((t: any) => ({
  id: t.id,
  code: t.code,
  description: t.description,
  category: t.category,
  durationWorkingDays: t.durationWorkingDays || 5,
  unit: t.unit,
  computedQuantity: t.computedQuantity,
})), null, 2)}

Devuelve obligatoriamente un JSON válido con:
{
  "executiveSummary": "Explicación técnica en 2-3 frases de la secuencia de perforación, entubado y montaje electromecánico aplicada.",
  "orderedTasks": [
    {
      "id": "ID exacto de la tarea",
      "sequenceOrder": 1,
      "phaseName": "Nombre de la etapa",
      "predecessorId": "ID predecesora o null",
      "recommendedPriority": "alta" | "media" | "baja",
      "reasoning": "Razón técnica de ingeniería de perforación",
      "isCriticalPath": true
    }
  ],
  "phaseGrouping": [
    {
      "phaseName": "Nombre de la etapa",
      "description": "Descripción técnica"
    }
  ]
}
Devuelve SOLO el JSON.`;

      const parsed = await generateWithRetry(ai, prompt, 0.15);
      if (parsed && Array.isArray(parsed.orderedTasks) && parsed.orderedTasks.length > 0) {
        return res.json({ success: true, data: parsed });
      }
      throw new Error('Respuesta inválida de Gemini');
    } catch (error: any) {
      console.warn('Utilizando secuenciador de perforación inteligente (fallback):', error?.message || error);

      const annotated = (tasks as any[]).map((t, idx) => {
        const catInfo = categorizeDrillingPhase(t.description || '', t.category || '');
        return {
          ...t,
          originalIndex: idx,
          phaseOrder: catInfo.phaseOrder,
          phaseName: catInfo.phaseName,
          recommendedPriority: catInfo.priority,
          isCritical: catInfo.isCritical,
        };
      });

      annotated.sort((a, b) => {
        if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
        return a.originalIndex - b.originalIndex;
      });

      const orderedTasks = annotated.map((t, i) => {
        const prev = i > 0 ? annotated[i - 1] : null;
        return {
          id: t.id,
          sequenceOrder: i + 1,
          phaseName: t.phaseName,
          predecessorId: prev ? prev.id : null,
          recommendedPriority: t.recommendedPriority,
          reasoning: `Secuencia operativa estándar de ingeniería de pozos para ${t.phaseName}`,
          isCriticalPath: t.isCritical || (t.phaseOrder <= 6),
        };
      });

      const uniquePhases = Array.from(new Set(annotated.map((t) => t.phaseName)));
      const phaseGrouping = uniquePhases.map((phase) => ({
        phaseName: phase,
        description: `Etapa crítica de campaña encadenada Fin-a-Inicio para optimizar el uso de sondas y dotación`,
      }));

      return res.json({
        success: true,
        fallback: true,
        data: {
          executiveSummary: `Se secuenciaron las ${tasks.length} actividades siguiendo el ciclo técnico de ingeniería de perforación: preparación de plataforma y piletas, inyección de lodos, perforación profunda por estrato, perfilaje eléctrico, entubado de casing API y montaje electromecánico de superficie.`,
          orderedTasks,
          phaseGrouping,
        },
      });
    }
  });

  // API: AI Cashflow & Procurement Optimization (Drilling, Mining & Energy)
  app.post('/api/ai/cashflow-optimization', async (req, res) => {
    const { budgetTotal, actualSpent, remainingMaterialsCost, monthlyCashflows, inflationRate } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Controller Financiero y Gerente de Supply Chain en Proyectos de Perforación, Minería y Energía.
Analiza los siguientes datos financieros de la campaña:
- Presupuesto Total de Campaña: ${budgetTotal}
- Gasto Real Certificado: ${actualSpent}
- Costo de Insumos Críticos Pendientes (Casing API, Coronas Diamantadas, Bentonita, Gasoil): ${remainingMaterialsCost}
- Flujo de Fondos de Campaña: ${JSON.stringify(monthlyCashflows)}
- Variación / Inflación proyectada mensual: ${inflationRate || 0}%

Genera un diagnóstico financiero y estrategia de abastecimiento (acopio de tubería Casing API, stock de coronas HQ/NQ, contratos de gasoil a granel y control de horas Stand-by) para proteger el margen operativo de la campaña.

Devuelve obligatoriamente un JSON:
{
  "financialHealth": "SALUDABLE" | "ALERTA" | "CRÍTICO",
  "earnedValueInsight": "Diagnóstico de rendimiento de costo (CPI), incidencia del gasoil y tarifas Running vs Stand-by",
  "procurementStrategy": "Recomendación de compra anticipada de Casing de acero API, trépanos/coronas diamantadas, bentonita y gasoil",
  "cashFlowWarnings": ["Advertencia 1", "Advertencia 2"],
  "recommendedActions": ["Acción 1", "Acción 2", "Acción 3"]
}

Devuelve SOLO el JSON.`;

      const parsed = await generateWithRetry(ai, prompt, 0.3);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for Drilling Cashflow analysis:', error?.message || error);
      res.json({
        success: true,
        fallback: true,
        data: {
          financialHealth: 'SALUDABLE',
          earnedValueInsight: 'El índice de desempeño de costo (CPI) se mantiene positivo gracias al control del ratio de horas operativas (Running) sobre horas Stand-by y a la eficiencia en metros perforados por turno.',
          procurementStrategy: 'Acopiar de forma anticipada el 100% de la cañería Casing de acero API J55, coronas diamantadas serie HQ/NQ y cerrar contrato de provisión de gasoil a granel en cisterna de campaña para blindar los costos directos.',
          cashFlowWarnings: [
            'Alinear los hitos de certificación por metro perforado y pozo entubado con las liquidaciones de turnos 14x14 y servicios de catering/campamento.',
            'Monitorear la desviación en el consumo horario de gasoil (L/h) de los grupos electrógenos y bombas de lodo.',
          ],
          recommendedActions: [
            'Emitir orden de compra cerrada por lote de Bentonita API y polímeros PHPA para toda la campaña.',
            'Certificar semanalmente los metros de avance de perforación y las horas de Stand-by imputables al comitente.',
            'Mantener stock de seguridad de 15.000 litros de gasoil en locación para evitar paradas de sonda por logística.',
          ],
        },
      });
    }
  });

  // API: Real-time Weather Proxy from Open-Meteo
  app.get('/api/weather', async (req, res) => {
    try {
      const lat = req.query.lat || '-34.6037';
      const lon = req.query.lon || '-58.3816';
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=7`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Weather API returned ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.warn('Weather fetch failed, sending realistic simulated weather:', error);
      res.json({
        current: {
          temperature_2m: 22.4,
          relative_humidity_2m: 65,
          precipitation: 0.0,
          weather_code: 1, // Mainly clear
          wind_speed_10m: 14.2,
        },
        daily: {
          time: [
            new Date().toISOString().slice(0, 10),
            new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
            new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
            new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10),
            new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
            new Date(Date.now() + 86400000 * 6).toISOString().slice(0, 10),
          ],
          weather_code: [1, 2, 61, 80, 0, 1, 3],
          temperature_2m_max: [24, 25, 19, 21, 23, 26, 27],
          temperature_2m_min: [14, 15, 13, 12, 13, 15, 16],
          precipitation_probability_max: [10, 25, 85, 60, 5, 10, 20],
          precipitation_sum: [0, 0, 18.5, 6.2, 0, 0, 0.4],
          wind_speed_10m_max: [15, 18, 32, 24, 12, 14, 16],
        },
      });
    }
  });

  // API: Geocoding Proxy (Open-Meteo + OpenStreetMap Nominatim with Node.js User-Agent)
  app.get('/api/geocode', async (req, res) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      if (!q) {
        return res.json({ results: [] });
      }

      const results: Array<{
        name: string;
        address: string;
        city: string;
        lat: number;
        lng: number;
        displayName: string;
      }> = [];

      // 1. Try Open-Meteo Geocoding API for fast city/municipality search
      try {
        const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          q
        )}&count=5&language=es&format=json`;
        const omResp = await fetch(omUrl);
        if (omResp.ok) {
          const omData = (await omResp.json()) as any;
          if (omData && omData.results && Array.isArray(omData.results)) {
            omData.results.forEach((r: any) => {
              const fullCity = r.name;
              const admin = r.admin1 || '';
              const country = r.country || '';
              const display = [fullCity, admin, country].filter(Boolean).join(', ');
              results.push({
                name: r.name,
                address: `Centro de ${r.name}`,
                city: r.name,
                lat: Number(r.latitude.toFixed(5)),
                lng: Number(r.longitude.toFixed(5)),
                displayName: display,
              });
            });
          }
        }
      } catch (omErr) {
        console.warn('Open-Meteo geocoding fallback:', omErr);
      }

      // 2. Also search OpenStreetMap Nominatim for exact addresses & street names
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          q
        )}&limit=5&addressdetails=1`;
        const nomResp = await fetch(nomUrl, {
          headers: {
            'User-Agent': 'Prisma-AKME-Construction-ERP/1.0 (contact: info@prisma-akme.com)',
            'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          },
        });
        if (nomResp.ok) {
          const nomData = (await nomResp.json()) as any[];
          if (Array.isArray(nomData)) {
            nomData.forEach((r) => {
              const addr = r.address || {};
              const city =
                addr.city ||
                addr.town ||
                addr.village ||
                addr.municipality ||
                addr.state ||
                r.name;
              const road = addr.road || addr.pedestrian || addr.suburb || '';
              const houseNum = addr.house_number || '';
              const cleanAddress = road
                ? `${road}${houseNum ? ' ' + houseNum : ''}`
                : r.display_name.split(',')[0];

              // Avoid duplicates
              const isDupe = results.some(
                (existing) =>
                  Math.abs(existing.lat - parseFloat(r.lat)) < 0.005 &&
                  Math.abs(existing.lng - parseFloat(r.lon)) < 0.005
              );
              if (!isDupe) {
                results.push({
                  name: r.name,
                  address: cleanAddress,
                  city: city || cleanAddress,
                  lat: Number(parseFloat(r.lat).toFixed(5)),
                  lng: Number(parseFloat(r.lon).toFixed(5)),
                  displayName: r.display_name,
                });
              }
            });
          }
        }
      } catch (nomErr) {
        console.warn('Nominatim geocoding fallback:', nomErr);
      }

      res.json({ results });
    } catch (err) {
      console.error('Geocode route error:', err);
      res.json({ results: [] });
    }
  });

  // API: Reverse Geocoding Proxy
  app.get('/api/geocode/reverse', async (req, res) => {
    try {
      const lat = req.query.lat as string;
      const lng = req.query.lng as string;
      if (!lat || !lng) {
        return res.json({ address: '', city: '' });
      }

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
      const nomResp = await fetch(url, {
        headers: {
          'User-Agent': 'Prisma-AKME-Construction-ERP/1.0 (contact: info@prisma-akme.com)',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        },
      });

      if (nomResp.ok) {
        const data = (await nomResp.json()) as any;
        const addr = data.address || {};
        const city =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.municipality ||
          addr.state ||
          'Localidad';
        const road = addr.road || addr.pedestrian || addr.suburb || '';
        const houseNum = addr.house_number || '';
        const cleanAddress = road
          ? `${road}${houseNum ? ' ' + houseNum : ''}`
          : data.display_name.split(',')[0];

        return res.json({
          address: cleanAddress,
          city,
          displayName: data.display_name,
        });
      }

      res.json({ address: '', city: '' });
    } catch (err) {
      console.error('Reverse geocode error:', err);
      res.json({ address: '', city: '' });
    }
  });

  // Vite middleware in development vs static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Construction & APU Integration Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
