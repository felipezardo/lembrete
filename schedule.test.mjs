import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Importa o módulo do navegador sem precisar de package.json na raiz do site.
const src = readFileSync(new URL('./schedule.js', import.meta.url), 'utf8');
const {H, D, doseTimes, status, lastTaken, reanchor} = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const med = (o = {}) => ({id: 'a', name: 'X', dose: '1', hours: 8, days: 1, start: 0, ...o});

test('antes da primeira dose só existe a próxima', () => {
  assert.deepEqual(status(med({start: 10 * H}), 0), {due: null, next: 10 * H});
});

test('dose vencida fica pendente até ser marcada', () => {
  assert.deepEqual(status(med(), 9 * H), {due: 8 * H, next: 16 * H});
  assert.deepEqual(status(med({ack: 8 * H}), 9 * H), {due: null, next: 16 * H});
});

test('última dose do tratamento não tem próxima', () => {
  assert.deepEqual(status(med(), 17 * H), {due: 16 * H, next: null});
});

test('7 dias de 8 em 8 horas = 21 doses', () => {
  assert.equal(doseTimes(med({days: 7})).length, 21);
});

test('informar a última dose recalcula os horários e mantém o fim do tratamento', () => {
  const m = med({days: 1, ...reanchor(10 * H)});
  assert.deepEqual(status(m, 11 * H), {due: null, next: 18 * H});
  assert.deepEqual(status(m, 19 * H), {due: 18 * H, next: null});
  assert.deepEqual(doseTimes(m), [10 * H, 18 * H]);
});

test('última dose antiga gera dose atrasada na hora', () => {
  const m = med({days: 3, ...reanchor(0)});
  assert.equal(status(m, 20 * H).due, 16 * H);
});

test('remédios antigos, sem anchor/end/taken, continuam funcionando', () => {
  const m = med({days: 2});
  assert.equal(status(m, 1 * H).next, 8 * H);
  assert.equal(lastTaken(m), 0);
  assert.equal(lastTaken({...m, ack: 8 * H}), 8 * H);
  assert.equal(doseTimes(m).at(-1) < 2 * D, true);
});

test('tratamento já encerrado não tem doses', () => {
  assert.deepEqual(status(med({anchor: 5 * D}), 6 * D), {due: null, next: null});
});
