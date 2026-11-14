#!/usr/bin/env node
// Converte lo storico della Scheda Allenamento (storico.json, stesso formato del backup)
// nelle righe del database Notion "Storico allenamenti".
//
// Uso: node tools/notion-rows.js <storico.json> [--da AAAA-MM-GG]
// Stampa un array JSON con una riga per seduta (dalla più vecchia), con le proprietà
// già nei nomi delle colonne Notion. Esercizi e giorni sono letti da index.html.
'use strict';
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
if (!args[0]) { console.error('Uso: node tools/notion-rows.js <storico.json> [--da AAAA-MM-GG]'); process.exit(1); }
const da = args.includes('--da') ? args[args.indexOf('--da') + 1] : null;

// Dati della scheda (GROUPS ... DAY) presi direttamente dall'app, così restano allineati.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('const GROUPS = {'), end = html.indexOf('/* ---------- Stato e salvataggio');
if (start < 0 || end < 0) throw new Error('Dati della scheda non trovati in index.html');
const { EX, DAY } = new Function(html.slice(start, end) + '\nreturn {EX, DAY};')();

// Focus per giorno, come nelle righe già presenti su Notion.
const FOCUS = {
  d1: ['Petto', 'Schiena', 'Postura', 'Braccia'],
  d2: ['Gambe', 'Glutei', 'Schiena', 'Spalle'],
  d3: ['Gambe', 'Spalle', 'Schiena', 'Core'],
  e1: ['Glutei', 'Petto', 'Schiena', 'Spalle'],
  e2: ['Gambe', 'Spalle', 'Schiena', 'Core'],
};
const PIANO = { '3': 'Settimana da 3 giorni', '2': 'Settimana da 2 giorni' };

const num = x => String(Math.round(x * 100) / 100).replace('.', ',');
const migliaia = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const giorno = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // AAAA-MM-GG
// Esercizi con carico vero: per pull-up assistito i kg sono assistenza, per plank e cardio sono secondi/minuti.
const conCarico = id => EX[id] && (EX[id].k === 'load' || EX[id].k === 'bw');

const dati = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const sessioni = (dati.sessions || []).filter(s => s && s.id && s.date && s.ex)
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const massimo = {}; // carico massimo finora per esercizio
const righe = [];
for (const s of sessioni) {
  const d = DAY[s.day] || {};
  const ids = Object.keys(s.ex).filter(id => EX[id] && s.ex[id].length);
  let serie = 0, volume = 0;
  const record = [];
  for (const id of ids) {
    const sets = s.ex[id];
    serie += sets.length;
    if (!conCarico(id)) continue;
    volume += sets.reduce((t, x) => t + (+x.kg || 0) * (+x.reps || 0), 0);
    const top = Math.max(...sets.map(x => +x.kg || 0));
    if (top > 0 && massimo[id] !== undefined && top > massimo[id]) record.push(EX[id].name + ' ' + num(top) + ' kg');
    if (top > 0) massimo[id] = Math.max(massimo[id] || 0, top);
  }
  const data = giorno(s.date);
  if (da && data < da) continue;
  righe.push({
    'ID seduta': s.id,
    'Allenamento': d.title || s.day,
    'date:Data:start': data,
    'date:Data:is_datetime': 0,
    'Durata (min)': s.mins > 0 ? s.mins : null,
    'Piano': PIANO[d.plan || '3'],
    'Focus': FOCUS[s.day] || [],
    'Esercizi': ids.map(id => EX[id].name),
    'Serie': serie,
    'Volume (kg)': Math.round(volume),
    'Record': record.length ? '🏆 ' + record.join(', ') : null,
    'Riepilogo': 'Serie: ' + serie + ' · Volume: ' + migliaia(volume) + ' kg',
  });
}
process.stdout.write(JSON.stringify(righe, null, 2) + '\n');
