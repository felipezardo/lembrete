/**
 * Regras de horário das doses. Funções puras (sem DOM, sem Firebase), por isso testáveis.
 *
 * Modelo de um remédio (Med):
 *   start   primeira dose planejada (ms)
 *   anchor  referência da grade de horários; padrão = start. Muda quando o usuário informa a última dose tomada
 *   end     fim do tratamento (ms); padrão = start + days * 1 dia. Não muda ao reajustar o horário
 *   hours   intervalo entre doses
 *   ack     horário da grade já tratado (dose tomada); doses com horário <= ack não geram aviso
 *   taken   quando a última dose foi realmente tomada (ms)
 */
export const H = 3600000;
export const D = 86400000;

export const step = m => m.hours * H;
export const anchorOf = m => m.anchor ?? m.start;
export const endOf = m => m.end ?? m.start + m.days * D;
export const lastTaken = m => m.taken || m.ack || 0;

/** Índice da última dose da grade (doses ocorrem estritamente antes do fim). */
const lastIndex = m => Math.ceil((endOf(m) - anchorOf(m)) / step(m)) - 1;

/** Todos os horários de dose da grade atual, do anchor até o fim do tratamento. */
export function doseTimes(m) {
  return Array.from({length: Math.max(0, lastIndex(m) + 1)}, (_, k) => anchorOf(m) + k * step(m));
}

/** Situação em `now`: `due` = dose pendente (ou null); `next` = próxima dose (ou null). */
export function status(m, now) {
  const a = anchorOf(m), last = lastIndex(m);
  if (last < 0) return {due: null, next: null};
  if (now < a) return {due: null, next: a};
  const k = Math.min(Math.floor((now - a) / step(m)), last);
  const t = a + k * step(m);
  return {due: t > (m.ack || 0) ? t : null, next: k < last ? t + step(m) : null};
}

/** Campos a gravar quando o usuário informa a hora real da última dose: a grade passa a partir dela. */
export const reanchor = t => ({anchor: t, ack: t, taken: t});
