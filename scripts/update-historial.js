#!/usr/bin/env node
/**
 * Script para actualizar automáticamente el historial de desarrollos
 * Se ejecuta con cada push a staging/main via GitHub Actions
 * 
 * Parsea los commits del push y crea registros en desarrollo_historial
 * Solo procesa commits con prefijos convencionales: feat, fix, refactor, perf, style, ui
 * 
 * Tabla: desarrollo_historial
 * Columnas: id, fecha, tipo, descripcion, commit_hash, rama, titulo, estado, autor
 */

const { Client } = require('pg');

const COMMIT_PREFIXES = {
  'feat': { tipo: 'ambas', estado: 'completado' },
  'fix': { tipo: 'privada', estado: 'completado' },
  'refactor': { tipo: 'privada', estado: 'completado' },
  'perf': { tipo: 'privada', estado: 'completado' },
  'style': { tipo: 'publica', estado: 'completado' },
  'ui': { tipo: 'publica', estado: 'completado' },
};

function parseCommitMessage(message) {
  // Formato esperado: "tipo: descripción" o "tipo(scope): descripción"
  const match = message.match(/^(feat|fix|refactor|perf|style|ui)(\([^)]+\))?:\s*(.+)/i);
  if (!match) return null;
  
  const prefix = match[1].toLowerCase();
  const scope = match[2] ? match[2].replace(/[()]/g, '') : null;
  const description = match[3].trim();
  
  // Ignorar commits muy cortos o de merge
  if (description.length < 5) return null;
  if (description.toLowerCase().startsWith('merge')) return null;
  
  const config = COMMIT_PREFIXES[prefix];
  
  // Construir título legible
  let titulo = description;
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  if (titulo.length > 255) titulo = titulo.substring(0, 252) + '...';
  
  return {
    titulo,
    descripcion: scope ? `[${scope}] ${description}` : description,
    tipo: config.tipo,
    estado: config.estado,
  };
}

async function main() {
  const commitMessages = process.env.COMMIT_MESSAGES;
  const commitHash = process.env.COMMIT_HASH || '';
  const branch = process.env.GITHUB_REF_NAME || 'staging';
  
  if (!commitMessages) {
    console.log('No hay mensajes de commit para procesar');
    process.exit(0);
  }

  // Parsear los commits (separados por ||)
  const commits = commitMessages.split('||').filter(Boolean);
  const registros = commits
    .map(parseCommitMessage)
    .filter(Boolean);

  if (registros.length === 0) {
    console.log('No hay commits relevantes para el historial (solo se procesan feat/fix/refactor/perf/style/ui)');
    process.exit(0);
  }

  console.log(`Procesando ${registros.length} commits para el historial...`);

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    
    for (const reg of registros) {
      // Verificar que no existe ya un registro con el mismo título en las últimas 24h
      const existing = await client.query(
        `SELECT id FROM desarrollo_historial WHERE titulo = $1 AND fecha > NOW() - INTERVAL '24 hours'`,
        [reg.titulo]
      );
      
      if (existing.rows.length > 0) {
        console.log(`  ⏭️  Saltando (ya existe): ${reg.titulo}`);
        continue;
      }

      await client.query(
        `INSERT INTO desarrollo_historial (titulo, descripcion, tipo, estado, autor, commit_hash, rama, fecha)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [reg.titulo, reg.descripcion, reg.tipo, reg.estado, 'Manus AI (auto)', commitHash, branch]
      );
      console.log(`  ✅ Insertado: ${reg.titulo}`);
    }

    console.log('Historial actualizado correctamente');
  } catch (error) {
    console.error('Error al actualizar historial:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
