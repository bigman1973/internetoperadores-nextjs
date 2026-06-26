/**
 * Script para importar datos del Airtable (conciliación Q1 2026) a la BD
 * y crear reglas de imputación automáticas basadas en los patrones
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface AirtableRow {
  name: string;
  mes: string;
  importe: number;
  fechaPagoEstimada: string | null;
  fechaPagoEfectiva: string | null;
  pagado: boolean;
  metodoPago: string | null;
  conciliado: boolean;
  bancoPago: string | null;
  tipoPago: string | null;
  esRecurrente: boolean;
  recurrencia: string | null;
  imputacion: string | null;
  conceptoPago: string | null;
}

function parseCSV(content: string): AirtableRow[] {
  const lines = content.split('\n');
  const rows: AirtableRow[] = [];
  
  // Parsear cabecera
  const header = parseCSVLine(lines[0]);
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 10) continue;
    
    const importeStr = fields[10] || '0';
    const importe = parseImporteES(importeStr);
    
    rows.push({
      name: fields[0] || '',
      mes: fields[8] || '',
      importe,
      fechaPagoEstimada: fields[11] || null,
      fechaPagoEfectiva: fields[12] || null,
      pagado: fields[13] === 'checked',
      metodoPago: fields[14] || null,
      conciliado: fields[15] === 'checked',
      bancoPago: fields[16] || null,
      tipoPago: fields[20] || null,
      esRecurrente: fields[21] === 'checked',
      recurrencia: fields[22] || null,
      imputacion: fields[29] || null,
      conceptoPago: fields[9] || null,
    });
  }
  
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

function parseImporteES(str: string): number {
  // Formato: -€2179,32 o €1125,08
  const clean = str.replace('€', '').replace(/\./g, '').replace(',', '.').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

async function main() {
  const csvPath = '/home/ubuntu/upload/Table1-Gridview(5).csv';
  const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''); // Remove BOM
  
  const rows = parseCSV(content);
  console.log(`Parseadas ${rows.length} filas del Airtable`);
  
  // 1. Crear reglas de imputación basadas en patrones
  const patrones: Map<string, { imputacion: string; tipoPago: string | null; banco: string | null; count: number }> = new Map();
  
  for (const row of rows) {
    if (!row.imputacion || !row.name) continue;
    
    // Extraer patrón del nombre (primeras palabras significativas)
    const patron = row.name
      .replace(/\d{2}\/\d{2}\/\d{2,4}/g, '') // Quitar fechas
      .replace(/\(\d+\/\d+\)/g, '') // Quitar (1/12)
      .replace(/\d{6,}/g, '') // Quitar números largos
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .split(' ')
      .filter(p => p.length > 2)
      .slice(0, 4)
      .join(' ');
    
    if (!patron || patron.length < 3) continue;
    
    const key = `${patron}|${row.imputacion}`;
    const existing = patrones.get(key);
    if (existing) {
      existing.count++;
    } else {
      patrones.set(key, {
        imputacion: row.imputacion,
        tipoPago: row.tipoPago,
        banco: row.bancoPago,
        count: 1,
      });
    }
  }
  
  // Insertar reglas con más de 1 ocurrencia (más fiables)
  let reglasCreadas = 0;
  for (const [key, data] of patrones) {
    const patron = key.split('|')[0];
    if (data.count < 1) continue; // Al menos 1 ocurrencia
    
    try {
      await prisma.reglaImputacion.create({
        data: {
          patron,
          imputacion: data.imputacion,
          tipoPago: data.tipoPago,
          banco: data.banco,
          confianza: Math.min(0.5 + (data.count * 0.1), 0.95),
          vecesUsada: data.count,
          activa: true,
        },
      });
      reglasCreadas++;
    } catch (e: any) {
      // Ignorar duplicados
    }
  }
  
  console.log(`Reglas de imputación creadas: ${reglasCreadas}`);
  
  // 2. Resumen de imputaciones
  const imputaciones: Record<string, { count: number; total: number }> = {};
  for (const row of rows) {
    const imp = row.imputacion || 'Sin imputación';
    if (!imputaciones[imp]) imputaciones[imp] = { count: 0, total: 0 };
    imputaciones[imp].count++;
    imputaciones[imp].total += row.importe;
  }
  
  console.log('\n--- Resumen de imputaciones ---');
  const sorted = Object.entries(imputaciones).sort((a, b) => b[1].count - a[1].count);
  for (const [imp, data] of sorted) {
    console.log(`  ${imp}: ${data.count} movimientos, ${data.total.toFixed(2)}€`);
  }
  
  // 3. Resumen de bancos
  const bancos: Record<string, number> = {};
  for (const row of rows) {
    const banco = row.bancoPago || 'Sin banco';
    bancos[banco] = (bancos[banco] || 0) + 1;
  }
  
  console.log('\n--- Movimientos por banco ---');
  for (const [banco, count] of Object.entries(bancos)) {
    console.log(`  ${banco}: ${count}`);
  }
  
  // 4. Resumen de métodos de pago
  const metodos: Record<string, number> = {};
  for (const row of rows) {
    const metodo = row.metodoPago || 'Sin método';
    metodos[metodo] = (metodos[metodo] || 0) + 1;
  }
  
  console.log('\n--- Métodos de pago ---');
  for (const [metodo, count] of Object.entries(metodos)) {
    console.log(`  ${metodo}: ${count}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
