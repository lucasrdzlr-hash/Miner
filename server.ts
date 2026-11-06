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
      if (!fs.existsSync(path.join(__dirname, '.git'))) {
        await execAsync('git init && git config user.name "Lucas Rodriguez" && git config user.email "lucasrdzlr@gmail.com" && git branch -M main').catch(() => {});
      }
      const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD').catch(() => ({ stdout: 'main\n' }));
      const { stdout: lastCommit } = await execAsync('git log -1 --pretty=format:"%h - %s (%ci)"').catch(() => ({ stdout: 'Initial commit\n' }));
      const { stdout: rawRemoteOrigin } = await execAsync('git remote get-url origin').catch(() => ({ stdout: 'https://github.com/lucasrdzlr-hash/Prisma.git\n' }));
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
      // 0. Ensure git is initialized and identity configured
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

  // API: AI APU Generator / Assistant
  app.post('/api/ai/suggest-apu', async (req, res) => {
    const { itemName, category, description, unit, countryContext } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como un Ingeniero Civil y Especialista Senior en Cómputos y Análisis de Precios Unitarios (APU) para la construcción.
Genera un desglose detallado de Análisis de Precios Unitarios para el siguiente ítem:
- Nombre del Ítem: "${itemName || 'Hormigón Armado en Losas'}"
- Rubro/Capítulo: "${category || 'Estructuras'}"
- Unidad de Medida: "${unit || 'm3'}"
- Descripción / Especificación: "${description || 'Hormigón elaborado H-21 con armadura de acero ADN 420 y encofrado de madera fenólica'}"
- Contexto Regional: "${countryContext || 'Latinoamérica / USD o moneda local'}"

Debes devolver obligatoriamente un JSON válido con la siguiente estructura exacta:
{
  "code": "APU-XXX",
  "name": "Nombre descriptivo exacto",
  "category": "Nombre del rubro",
  "unit": "Unidad (m3, m2, m, un, kg, glb)",
  "description": "Especificación técnica resumida y método constructivo",
  "materials": [
    { "name": "Nombre de insumo (ej. Cemento Portland)", "unit": "kg o bolsa", "yieldRatio": 300, "wastePercent": 5, "unitPrice": 0.25 }
  ],
  "labor": [
    { "role": "Oficial Especializado / Oficial / Ayudante", "unit": "hh", "yieldRatio": 4.5, "hourlyRate": 8.0, "socialChargesPercent": 45 }
  ],
  "equipment": [
    { "name": "Nombre de equipo/herramienta (ej. Hormigonera 400L / Vibrador de inmersión)", "unit": "hm", "yieldRatio": 1.2, "hourlyRate": 4.5 }
  ],
  "overheadPercent": 15,
  "profitPercent": 10,
  "taxPercent": 21,
  "tips": ["Consejo de rendimiento o ejecución en obra"]
}

Sé técnicamente riguroso con los rendimientos reales de construcción (coeficientes de aporte por unidad de medida).
Devuelve SOLO el JSON sin texto markdown adicional.`;

      const parsed = await generateWithRetry(ai, prompt, 0.2);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for APU generation:', error?.message || error);
      // Domain-intelligent construction fallback
      res.json({
        success: true,
        fallback: true,
        data: {
          code: 'APU-GEN',
          name: itemName || 'Partida de Obra',
          category: category || 'Estructuras y Obras Generales',
          unit: unit || 'm3',
          description: description || `Ejecución de ${itemName || 'partida constructiva'} según normas técnicas y buenas prácticas del arte del construir.`,
          materials: [
            { name: 'Cemento Portland Normal (bolsa 50kg)', unit: 'bolsa', yieldRatio: 7.0, wastePercent: 5, unitPrice: 9.5 },
            { name: 'Arena Gruesa Limpia Lavada', unit: 'm3', yieldRatio: 0.65, wastePercent: 7, unitPrice: 32.0 },
            { name: 'Piedra Partida / Grava 6-20mm', unit: 'm3', yieldRatio: 0.85, wastePercent: 8, unitPrice: 38.0 },
            { name: 'Acero Conformado ADN 420', unit: 'kg', yieldRatio: 85.0, wastePercent: 6, unitPrice: 1.45 },
          ],
          labor: [
            { role: 'Oficial Especializado Armador / Encofrador', unit: 'hh', yieldRatio: 6.5, hourlyRate: 9.5, socialChargesPercent: 45 },
            { role: 'Ayudante de Albañilería', unit: 'hh', yieldRatio: 7.5, hourlyRate: 6.5, socialChargesPercent: 45 },
          ],
          equipment: [
            { name: 'Hormigonera Eléctrica 400 Litros', unit: 'hm', yieldRatio: 1.5, hourlyRate: 5.0 },
            { name: 'Vibrador de Inmersión Eléctrico Alta Frecuencia', unit: 'hm', yieldRatio: 1.5, hourlyRate: 3.5 },
          ],
          overheadPercent: 15,
          profitPercent: 10,
          taxPercent: 21,
          tips: [
            'Verificar recubrimientos mínimos con separadores plásticos de armadura antes del colado.',
            'Mantener el curado húmedo continuo durante los primeros 7 días.',
          ],
        },
      });
    }
  });

  // API: AI Weather & Critical Path Schedule Advisor
  app.post('/api/ai/analyze-schedule-weather', async (req, res) => {
    const { tasks, weatherForecast, projectName } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Director de Obra y Jefe de Planificación de Proyectos.
Analiza la siguiente jornada de obra y pronóstico del tiempo para la obra "${projectName || 'Obra Principal'}":

Tareas programadas en la agenda / ruta crítica:
${JSON.stringify(tasks, null, 2)}

Pronóstico meteorológico previsto para los próximos días:
${JSON.stringify(weatherForecast, null, 2)}

Analiza:
1. Riesgos climáticos directos para cada tarea (ej. Lluvia vs Hormigonado/Cubiertas/Mampostería a la intemperie; Viento vs Grúas/Trabajo en altura; Frío extremo vs fraguado).
2. Impacto en la Ruta Crítica y Plazos de entrega proyectados (días de holgura y desvío estimado).
3. Recomendaciones operativas accionables para la jornada (medidas de protección, reprogramaciones inteligentes, tareas bajo cubierta alternativas).

Devuelve obligatoriamente un JSON válido:
{
  "generalRiskLevel": "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO",
  "summary": "Resumen ejecutivo del impacto climático en 2-3 oraciones",
  "taskImpacts": [
    {
      "taskName": "Nombre de la tarea",
      "critical": true,
      "risk": "Descripción del riesgo climático",
      "severity": "ALTO" | "MEDIO" | "BAJO",
      "actionRecommendation": "Acción inmediata recomendada (reprogramar, proteger, adelantar acopio, etc.)"
    }
  ],
  "criticalPathAlert": "Alerta sobre el plazo final de obra o si no hay afectación",
  "contingencyPlan": ["Paso 1", "Paso 2", "Paso 3"]
}

Devuelve SOLO el JSON sin texto markdown.`;

      const parsed = await generateWithRetry(ai, prompt, 0.3);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for Weather & Schedule analysis:', error?.message || error);
      // Domain-intelligent weather risk fallback
      res.json({
        success: true,
        fallback: true,
        data: {
          generalRiskLevel: 'MEDIO',
          summary: `Se prevén jornadas con variables meteorológicas a monitorear para ${projectName || 'la obra'}. Se recomienda extremar precauciones en tareas húmedas y trabajos en altura.`,
          taskImpacts: [
            {
              taskName: 'Hormigonados y Colados de Estructura',
              critical: true,
              risk: 'Riesgo de lavado de pasta fresca y pérdida de resistencia superficial por precipitaciones imprevistas.',
              severity: 'ALTO',
              actionRecommendation: 'Disponer lonas de polietileno de 200 micrones en obra y verificar aditivos acelerantes de fraguado.',
            },
            {
              taskName: 'Mampostería Exterior y Revoques',
              critical: false,
              risk: 'Humedad ambiental alta que puede demorar el tiempo de secado y curado de morteros.',
              severity: 'MEDIO',
              actionRecommendation: 'Priorizar frentes de trabajo interiores o tabiquería en seco durante días inestables.',
            },
            {
              taskName: 'Montaje de Andamios y Cubiertas',
              critical: true,
              risk: 'Ráfagas de viento que comprometen la estabilidad del personal en trabajos en altura.',
              severity: 'ALTO',
              actionRecommendation: 'Suspender izajes y trabajos en cota superior a +6.00m si el viento supera los 35 km/h.',
            },
          ],
          criticalPathAlert: 'Las tareas críticas no registran atrasos acumulados, pero se sugiere adelantar acopio de insumos para no frenar la ruta crítica.',
          contingencyPlan: [
            'Proteger acopios de cemento y yeso bajo tinglado o sobre pallets con doble envoltura plástica.',
            'Reasignar cuadrillas de albañilería a tareas interiores bajo losa en caso de lluvia.',
            'Comprobar bombas sumergibles de achique en fosa de ascensor y subsuelos.',
          ],
        },
      });
    }
  });

  // API: AI Gantt Schedule & Resource Simulation Advisor
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

      const prompt = `Actúa como Ingeniero Civil Senior, Especialista en Planificación de Obras y Control de Proyectos (PMP / PMI-SP).
Analiza la siguiente simulación de cronograma y recursos para la obra "${projectName || 'Obra en Ejecución'}":

MODO DE SIMULACIÓN SELECCIONADO: ${
        simulationMode === 'deadline'
          ? 'POR PLAZO LÍMITE (Crashing / Recursos Dinámicos para cumplir fecha meta)'
          : simulationMode === 'fixed_crew'
          ? 'POR CUADRILLA FIJA (Nivelación de Recursos / Duraciones según capacidad real)'
          : 'MODO ÓPTIMO COSTO-PLAZO (Fast-Tracking selectivo)'
      }

PARÁMETROS DE LA SIMULACIÓN:
${JSON.stringify(parameters || {}, null, 2)}

COMPARATIVA RESUMEN (LÍNEA BASE vs SIMULACIÓN):
- Línea Base Original: Inicio ${baselineSummary?.startDate}, Fin ${baselineSummary?.endDate}, Duración ${baselineSummary?.totalWorkingDays} días laborables, Pico Personal ${baselineSummary?.peakWorkers} operarios, Costo M.O. $${baselineSummary?.totalLaborCost}
- Escenario Simulado: Inicio ${simulatedSummary?.startDate}, Fin ${simulatedSummary?.endDate}, Duración ${simulatedSummary?.totalWorkingDays} días laborables, Variación ${simulatedSummary?.daysDelta > 0 ? '+' : ''}${simulatedSummary?.daysDelta} días, Pico Personal ${simulatedSummary?.peakWorkers} operarios, Costo M.O. $${simulatedSummary?.totalLaborCost}, Variación Costo $${simulatedSummary?.costDelta}

TAREAS PRINCIPALES DEL CRONOGRAMA SIMULADO:
${JSON.stringify(sampleTasks || [], null, 2)}

INSTRUCCIONES DE ANÁLISIS:
1. Evalúa la VIABILIDAD TÉCNICA y OPERATIVA en terreno del escenario simulado (considera rendimientos decrecientes si la cuadrilla se sobredimensiona, y riesgos de ampliación de plazo si la cuadrilla es fija reducida).
2. Identifica CUELLOS DE BOTELLA (espacios físicos limitados, turnos, tiempos tecnológicos de fraguado de hormigón o curado que no admiten compresión indiscriminada).
3. Recomienda el PLAN DE INCORPORACIÓN DE PERSONAL (cuándo ingresar oficiales y ayudantes para evitar tiempos muertos o sobrecostos innecesarios).
4. Emite 3 RECOMENDACIONES OPERATIVAS ACCIONABLES para el Jefe de Obra y Capataz.

Debes devolver obligatoriamente un JSON válido:
{
  "feasibilityScore": "ALTA" | "MEDIA" | "BAJA",
  "executiveVerdict": "Dictamen ejecutivo sobre la viabilidad constructiva del escenario en 2-3 oraciones",
  "bottlenecks": [
    {
      "area": "Nombre del rubro/frente de obra",
      "description": "Explicación del cuello de botella",
      "mitigation": "Estrategia para resolverlo en obra"
    }
  ],
  "resourceDemands": [
    {
      "role": "Oficial Especializado / Oficial / Ayudante",
      "peakNeeded": 6,
      "recommendation": "Pauta de incorporación y gestión de la cuadrilla"
    }
  ],
  "risks": [
    {
      "risk": "Riesgo constructivo o de plazo",
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
      console.warn('Using intelligent fallback for Gantt simulation analysis:', error?.message || error);

      // Intelligent domain-grounded construction fallback
      const isDeadlineMode = simulationMode === 'deadline';
      const daysDelta = simulatedSummary?.daysDelta || 0;
      const peakWorkers = simulatedSummary?.peakWorkers || 8;

      res.json({
        success: true,
        fallback: true,
        data: {
          feasibilityScore: Math.abs(daysDelta) > 45 ? 'MEDIA' : 'ALTA',
          executiveVerdict: isDeadlineMode
            ? `El escenario por plazo límite permite acortar ${Math.abs(daysDelta)} días mediante el refuerzo de cuadrillas críticas (${peakWorkers} operarios en pico). Es técnicamente factible si se escalonan los frentes de trabajo para evitar interferencias espaciales.`
            : `El escenario por cuadrilla fija nivela la demanda laboral garantizando ocupación continua y eliminando despidos bruscos. El cronograma resultante proyecta una finalización realista basada en rendimientos estándar de obra civil.`,
          bottlenecks: [
            {
              area: 'Frentes Estructurales y Encofrados',
              description: isDeadlineMode
                ? 'El aumento de personal en losas y columnas requiere mayor stock de puntales y fenólicos para habilitar trabajo simultáneo sin esperas.'
                : 'La cuadrilla fija puede generar tiempos de espera si las tareas precedentes no liberan el frente a tiempo.',
              mitigation: isDeadlineMode
                ? 'Coordinar entregas anticipadas de encofrados y prearmado de armaduras a pie de obra.'
                : 'Priorizar la liberación secuencial de sectores (sectorización por tercios de planta).',
            },
            {
              area: 'Interferencias de Gremios Húmedos e Instalaciones',
              description: 'El solapamiento de cañerías eléctricas y sanitarias con el colado de hormigón exige supervisión estricta.',
              mitigation: 'Implementar pases de losa estandarizados y checklists previos a la autorización del colado.',
            },
          ],
          resourceDemands: [
            {
              role: 'Oficial Especializado (Armador / Encofrador)',
              peakNeeded: Math.max(2, Math.ceil(peakWorkers * 0.3)),
              recommendation: 'Asignar al frente crítico de estructura; mantener durante toda la fase de hormigonado.',
            },
            {
              role: 'Oficial Albañil',
              peakNeeded: Math.max(2, Math.ceil(peakWorkers * 0.35)),
              recommendation: 'Coordinar con la cuadrilla de mampostería e impermeabilizaciones.',
            },
            {
              role: 'Ayudante de Obra',
              peakNeeded: Math.max(2, Math.ceil(peakWorkers * 0.35)),
              recommendation: 'Asegurar logística interna de acarreo de mezclas y descarga de camiones para no frenar a los oficiales.',
            },
          ],
          risks: [
            {
              risk: 'Tiempos tecnológicos mínimos de fraguado',
              impact: 'ALTO',
              action: 'No reducir plazos de desencofrado por debajo de las normas CIRSOC / ACI; usar aditivos acelerantes de resistencia si se busca rapidez.',
            },
            {
              risk: isDeadlineMode ? 'Rendimientos decrecientes por saturación de operarios' : 'Desvío de fecha límite contractual',
              impact: 'MEDIO',
              action: isDeadlineMode
                ? 'Limitar a un máximo de 4 operarios por frente de 25 m2 para preservar la productividad individual.'
                : 'Analizar horas extras puntuales en la ruta crítica si se acerca la fecha límite de entrega.',
            },
          ],
          recommendations: [
            isDeadlineMode
              ? 'Habilitar un turno de preparación y acopio temprano (7:00 a 8:00 AM) para que la cuadrilla empiece a producir de inmediato.'
              : 'Mantener la composición de cuadrilla constante para afianzar la curva de aprendizaje de los operarios.',
            'Verificar semanalmente el avance físico real respecto al escenario simulado para detectar desvíos antes de 72 horas.',
            'Consultar con el pañolero la disponibilidad de herramientas eléctricas y equipos auxiliares antes de incorporar operarios adicionales.',
          ],
        },
      });
    }
  });

  // API: AI Construction Logical Sequencing & Cascade
  app.post('/api/ai/sequence-gantt-tasks', async (req, res) => {
    const {
      projectName,
      projectStartDate,
      sequenceMode,
      tasks = [],
    } = req.body;

    // Helper heuristic classification function
    const categorizeConstructionPhase = (desc: string, cat: string) => {
      const text = `${desc} ${cat}`.toLowerCase();
      if (text.includes('demol') || text.includes('obrador') || text.includes('cerco') || text.includes('replanteo') || text.includes('desmonte') || text.includes('preliminar')) {
        return { phaseOrder: 1, phaseName: '1. Trabajos Preliminares & Replanteo', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('excav') || text.includes('suelo') || text.includes('zanja') || text.includes('terraplen') || text.includes('compactac') || text.includes('relleno')) {
        return { phaseOrder: 2, phaseName: '2. Movimiento de Suelos & Excavaciones', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('pilote') || text.includes('pilotin') || text.includes('zapata') || text.includes('platea') || text.includes('cimiento') || text.includes('fundac') || text.includes('cabezal') || text.includes('pozo romano') || text.includes('viga de fundacion') || text.includes('viga fundacion') || text.includes('encadenado inferior')) {
        return { phaseOrder: 3, phaseName: '3. Cimentaciones & Fundaciones', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('columna') || text.includes('viga') || text.includes('losa') || text.includes('tabique') || text.includes('hormigon armado') || text.includes('hormigón armado') || text.includes('encofrad') || text.includes('armadura') || text.includes('hierro') || text.includes('estructur')) {
        return { phaseOrder: 4, phaseName: '4. Estructura Resistente & Hormigón', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('mamposter') || text.includes('ladrill') || text.includes('bloque') || text.includes('muro') || text.includes('pared') || text.includes('dintel')) {
        return { phaseOrder: 5, phaseName: '5. Mampostería & Cerramientos', priority: 'alta' as const, isCritical: true };
      }
      if (text.includes('techo') || text.includes('cubierta') || text.includes('chapa') || text.includes('aislac') || text.includes('membrana') || text.includes('impermeab') || text.includes('babeta') || text.includes('zinguer')) {
        return { phaseOrder: 6, phaseName: '6. Cubiertas & Aislaciones', priority: 'media' as const, isCritical: false };
      }
      if (text.includes('cloac') || text.includes('sanitar') || text.includes('pluvial') || text.includes('caneria') || text.includes('gas') || text.includes('electric') || text.includes('embutid') || text.includes('termofus')) {
        return { phaseOrder: 7, phaseName: '7. Instalaciones Embutidas de Base', priority: 'media' as const, isCritical: false };
      }
      if (text.includes('contrapiso') || text.includes('cascote') || text.includes('alivianado') || text.includes('hormigon pobre')) {
        return { phaseOrder: 8, phaseName: '8. Contrapisos & Hormigón Pobre', priority: 'media' as const, isCritical: true };
      }
      if (text.includes('revoque') || text.includes('jaharro') || text.includes('enlucido') || text.includes('azotado') || text.includes('capa aisladora')) {
        return { phaseOrder: 9, phaseName: '9. Revoques & Capas Aisladoras', priority: 'media' as const, isCritical: false };
      }
      if (text.includes('carpeta') || text.includes('nivelacion') || text.includes('nivelación')) {
        return { phaseOrder: 10, phaseName: '10. Carpetas de Nivelación', priority: 'media' as const, isCritical: true };
      }
      if (text.includes('cielorras') || text.includes('durlock') || text.includes('yeso')) {
        return { phaseOrder: 11, phaseName: '11. Cielorrasos & Yesería', priority: 'media' as const, isCritical: false };
      }
      if (text.includes('pisos') || text.includes('piso') || text.includes('revest') || text.includes('ceramic') || text.includes('porcelan') || text.includes('azulej') || text.includes('zocalo')) {
        return { phaseOrder: 12, phaseName: '12. Pisos & Revestimientos', priority: 'media' as const, isCritical: true };
      }
      if (text.includes('carpinter') || text.includes('puerta') || text.includes('ventana') || text.includes('marco') || text.includes('aluminio') || text.includes('vidrio') || text.includes('herrer')) {
        return { phaseOrder: 13, phaseName: '13. Carpinterías & Vidrios', priority: 'media' as const, isCritical: false };
      }
      if (text.includes('pintur') || text.includes('latex') || text.includes('enduido') || text.includes('esmalte') || text.includes('barniz')) {
        return { phaseOrder: 14, phaseName: '14. Pintura & Acabados', priority: 'baja' as const, isCritical: false };
      }
      if (text.includes('grifer') || text.includes('inodoro') || text.includes('lavatorio') || text.includes('artefact') || text.includes('caldera') || text.includes('termotanque') || text.includes('bidet') || text.includes('iluminac')) {
        return { phaseOrder: 15, phaseName: '15. Montaje de Artefactos & Griferías', priority: 'baja' as const, isCritical: false };
      }
      if (text.includes('limpieza') || text.includes('final') || text.includes('entrega') || text.includes('retiro') || text.includes('escombros') || text.includes('parquiz')) {
        return { phaseOrder: 16, phaseName: '16. Limpieza Final & Entrega de Obra', priority: 'baja' as const, isCritical: true };
      }
      return { phaseOrder: 6.5, phaseName: 'Fase Constructiva General', priority: 'media' as const, isCritical: false };
    };

    try {
      const ai = getGeminiClient();
      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Ingeniero Civil Senior, Jefe de Planificación y Control de Obras (especialista en Métodos CPM, Redes de Precedencias PDM y Cronogramas Gantt).
Analiza la siguiente lista de partidas del presupuesto de la obra "${projectName || 'Obra en Construcción'}".
Actualmente muchas partidas están agrupadas o empiezan el mismo día, lo que no refleja la realidad constructiva.
Tu tarea es ordenarlas en la SECUENCIA LÓGICA CONSTRUCTIVA CORRECTA (cada tarea debe comenzar cuando su antecesora técnica esté lista o en proceso de liberación).

Modo Solicitado: ${sequenceMode || 'construction_phases'}

LISTA DE TAREAS A ORDENAR:
${JSON.stringify(tasks.map((t: any) => ({
  id: t.id,
  code: t.code,
  description: t.description,
  category: t.category,
  durationWorkingDays: t.durationWorkingDays || 5,
  unit: t.unit,
  computedQuantity: t.computedQuantity,
})), null, 2)}

ESTRUCTURA DE ETAPAS CONSTRUCTIVAS MAESTRAS (JERARQUÍA Y PRECEDENCIAS FÍSICAS OBLIGATORIAS):
1. Trabajos Preliminares & Replanteo (obrador, demolición, cerco, replanteo)
2. Movimiento de Suelos & Excavaciones (desmonte, zanjas, pozos)
3. Cimentaciones & Fundaciones (pilotes, pilotines, zapatas, platea, vigas de fundación, cabezales). ¡REGLA INQUEBRANTABLE: "pilote" o "zapata" SIEMPRE serán Cimentaciones y SIEMPRE irán ANTES de cualquier mampostería o estructura!
4. Estructura Resistente & Hormigón (columnas, vigas, losas macizas/alivianadas, encadenados).
5. Mampostería & Cerramientos (muros de ladrillo hueco/común/bloques, tabiques).
6. Cubiertas & Aislaciones (techos de chapa, losas de techo, membranas, zinguería).
7. Instalaciones Embutidas de Base (cloaca bajo suelo, cañerías eléctricas, agua termofusión, gas).
8. Contrapisos & Hormigón Pobre (contrapiso de cascote sobre terreno, sobre losa).
9. Revoques & Capas Aisladoras (azotado impermeable, jaharro grueso).
10. Carpetas de Nivelación (carpeta cementicia fratasada para pisos). ¡REGLA INQUEBRANTABLE: Contrapiso ➔ Carpeta ➔ Piso NUNCA pueden iniciar el mismo día, deben ejecutarse en estricta cascada FS!
11. Cielorrasos & Yesería (Durlock suspendido, yeso aplicado).
12. Pisos & Revestimientos (porcelanato, cerámicos, zócalos, azulejos).
13. Carpinterías & Vidrios (marcos, aberturas de aluminio, puertas placa, cristales DVH).
14. Pintura & Acabados (enduido, fijador, látex interior/exterior, esmalte).
15. Montaje de Artefactos & Griferías (inodoros, griferías, calderas, tapas eléctricas).
16. Limpieza Final & Entrega de Obra.

Devuelve obligatoriamente un JSON válido con esta estructura:
{
  "executiveSummary": "Explicación técnica en 2-3 frases de la secuencia lógica aplicada para optimizar el cronograma y eliminar solapamientos caóticos.",
  "orderedTasks": [
    {
      "id": "ID exacto de la tarea",
      "sequenceOrder": 1, // Número correlativo de orden de ejecución (1, 2, 3...)
      "phaseName": "Nombre de la fase (ej: 3. Cimentaciones & Fundaciones...)",
      "predecessorId": "ID de la tarea predecesora directa o null si es la primera",
      "recommendedPriority": "alta" | "media" | "baja",
      "reasoning": "Razón técnica constructiva breve de por qué se ubica en este orden",
      "isCriticalPath": boolean
    }
  ],
  "phaseGrouping": [
    {
      "phaseName": "Nombre de la fase",
      "description": "Descripción de lo que abarca esta etapa de obra"
    }
  ]
}
Devuelve SOLO el JSON, sin texto explicativo exterior ni markdown.`;

      const parsed = await generateWithRetry(ai, prompt, 0.15);
      if (parsed && Array.isArray(parsed.orderedTasks) && parsed.orderedTasks.length > 0) {
        return res.json({ success: true, data: parsed });
      }
      throw new Error('Respuesta inválida de Gemini');
    } catch (error: any) {
      console.warn('Utilizando secuenciador constructivo inteligente (fallback):', error?.message || error);

      // Algoritmo determinístico de secuenciación de ingeniería civil
      const annotated = (tasks as any[]).map((t, idx) => {
        const catInfo = categorizeConstructionPhase(t.description || '', t.category || '');
        return {
          ...t,
          originalIndex: idx,
          phaseOrder: catInfo.phaseOrder,
          phaseName: catInfo.phaseName,
          recommendedPriority: catInfo.priority,
          isCritical: catInfo.isCritical,
        };
      });

      // Ordenar por fase y luego por índice original o código
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
          reasoning: `Secuencia constructiva estándar para fase ${t.phaseName}`,
          isCriticalPath: t.isCritical || (t.phaseOrder <= 4),
        };
      });

      const uniquePhases = Array.from(new Set(annotated.map((t) => t.phaseName)));
      const phaseGrouping = uniquePhases.map((phase) => ({
        phaseName: phase,
        description: `Etapa técnica de ejecución programada en cascada constructiva`,
      }));

      return res.json({
        success: true,
        fallback: true,
        data: {
          executiveSummary: `Se ordenaron lógicamente las ${tasks.length} partidas según las buenas prácticas de la ingeniería civil (desde preliminares y fundaciones hasta terminaciones y limpieza), encadenando cada actividad de forma secuencial fin a inicio para eliminar solapamientos no planificados.`,
          orderedTasks,
          phaseGrouping,
        },
      });
    }
  });

  // API: AI Cashflow & Procurement Optimization
  app.post('/api/ai/cashflow-optimization', async (req, res) => {
    const { budgetTotal, actualSpent, remainingMaterialsCost, monthlyCashflows, inflationRate } = req.body;
    try {
      const ai = getGeminiClient();

      if (!ai) {
        throw new Error('Gemini API key is not configured.');
      }

      const prompt = `Actúa como Controller Financiero de Empresas Constructoras y Gerente de Compras.
Analiza los siguientes datos financieros de la obra:
- Presupuesto Total: ${budgetTotal}
- Gasto Real Acumulado: ${actualSpent}
- Costo de Insumos Pendientes de Compra: ${remainingMaterialsCost}
- Flujo de Fondos (Meses / Semanas): ${JSON.stringify(monthlyCashflows)}
- Tasa inflacionaria / devaluación proyectada mensual: ${inflationRate || 0}%

Genera un diagnóstico financiero y estrategia de compra de materiales (acopio temprano vs compra just-in-time) para proteger el margen de la obra y evitar descalces de caja.

Devuelve obligatoriamente un JSON:
{
  "financialHealth": "SALUDABLE" | "ALERTA" | "CRÍTICO",
  "earnedValueInsight": "Comentario sobre el rendimiento de costo (CPI) y ritmo de gasto",
  "procurementStrategy": "Recomendación para la compra de materiales clave (acopio anticipado de insumos críticos con riesgo de subida)",
  "cashFlowWarnings": ["Advertencia 1", "Advertencia 2"],
  "recommendedActions": ["Acción 1", "Acción 2", "Acción 3"]
}

Devuelve SOLO el JSON.`;

      const parsed = await generateWithRetry(ai, prompt, 0.3);
      res.json({ success: true, data: parsed });
    } catch (error: any) {
      console.warn('Using intelligent fallback for Cashflow analysis:', error?.message || error);
      res.json({
        success: true,
        fallback: true,
        data: {
          financialHealth: 'SALUDABLE',
          earnedValueInsight: 'El ritmo de desembolsos se mantiene alineado con la curva S planificada de la obra.',
          procurementStrategy: 'Estrategia de acopio selectivo: comprar por adelantado insumos dolarizados o con alta volatilidad (hierro, cables, aluminio) para fijar costos.',
          cashFlowWarnings: [
            'Sincronizar el pago a proveedores críticos con la fecha de cobro efectivo de los certificados.',
            'Mantener una reserva de liquidez equivalente a 2 semanas operativas de jornales.',
          ],
          recommendedActions: [
            'Gestionar órdenes de compra con entrega programada para no saturar el pañol.',
            'Presentar las certificaciones de obra con suficiente antelación al comitente.',
            'Monitorear semanalmente el desvío entre precios presupuestados y precios vigentes en obra.',
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
