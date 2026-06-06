/**
 * funds.js — SW-15: Dynamic fund universe
 *
 * The fund list used to be a hardcoded array in App.jsx. SW-15 makes it dynamic:
 * the user can ADD new funds and ARCHIVE (soft-delete) existing ones, all stored
 * in localStorage. There is NO hard delete — archiving only sets `archived: true`,
 * so a fund's signal history / goal mappings are never destroyed.
 *
 * For a Python dev: think of this as a small "repository" layer. There's a fixed
 * seed list (DEFAULT_FUNDS) plus a user-editable overlay persisted as JSON. The
 * "effective" list is the merge of the two, with archived entries filtered out for
 * the UI that buys/scores funds (signal cards, dip prioritisation, goal picker).
 *
 * A fund object:
 *   { id, name, searchQ, goals, category, index, archived? }
 *     - id        unique string key (used in goal.funds, metrics map, etc.)
 *     - name      display name
 *     - searchQ   query string used against mfapi.in to resolve the scheme
 *     - goals     legacy goal-id mapping (kept for back-compat; new goals map via goal.funds)
 *     - category  'Small Cap' | 'Mid Cap' | 'Large Cap' | 'Flexi Cap' | 'Arbitrage' | ...
 *     - index     benchmark index key for CAGR suggestion + P/E band:
 *                 'smallcap' | 'midcap' | 'largecap' | 'nifty500' | null (arbitrage/debt)
 *     - archived  true = soft-deleted (hidden from pickers/cards, data retained)
 */

// localStorage key for the user fund overlay (added funds + archive flags).
export const FUNDS_STORAGE_KEY = 'artha_funds_v1';

// ─── Seed list ─────────────────────────────────────────────────────
// These are the funds the app shipped with. They are NOT stored in localStorage
// unless the user archives one (in which case an override entry is written).
export const DEFAULT_FUNDS = [
  { id: 'niscf',  name: 'Nippon India Small Cap',     searchQ: 'Nippon India Small Cap',      goals: ['retirement', 'education'], category: 'Small Cap',       index: 'smallcap' },
  { id: 'hdfcsc', name: 'HDFC Small Cap',             searchQ: 'HDFC Small Cap Fund',         goals: ['retirement', 'education'], category: 'Small Cap',       index: 'smallcap' },
  { id: 'hdfcmd', name: 'HDFC Mid-Cap Opportunities', searchQ: 'HDFC Mid Cap Fund',           goals: ['retirement', 'education'], category: 'Mid Cap',         index: 'midcap' },
  { id: 'nimcap', name: 'Nippon India MultiCap',      searchQ: 'Nippon India Multi Cap',      goals: ['retirement'],              category: 'Multi Cap',       index: 'nifty500' },
  { id: 'hdfcfc', name: 'HDFC Flexi Cap',             searchQ: 'HDFC Flexi Cap Fund',         goals: ['retirement', 'education'], category: 'Flexi Cap',       index: 'nifty500' },
  { id: 'mirae',  name: 'Mirae Large & Midcap',       searchQ: 'Mirae Asset Large',           goals: ['retirement', 'education'], category: 'Large & Mid Cap', index: 'midcap' },
  { id: 'sbiarb', name: 'SBI Arbitrage Opps',         searchQ: 'SBI Arbitrage Opportunities', goals: ['education'],                category: 'Arbitrage',       index: null },
  { id: 'sbisc',  name: 'SBI Small Cap',              searchQ: 'SBI Small Cap Fund',          goals: ['retirement', 'education'], category: 'Small Cap',       index: 'smallcap' },
];

// ─── Persistence ───────────────────────────────────────────────────
/**
 * Load the user fund overlay from localStorage.
 * Shape: { added: [fund, ...], archivedIds: [id, ...] }
 *   - added       user-created funds (full fund objects)
 *   - archivedIds ids (of seed OR added funds) the user has archived
 */
export function loadUserFunds() {
  try {
    const raw = localStorage.getItem(FUNDS_STORAGE_KEY);
    if (!raw) return { added: [], archivedIds: [] };
    const parsed = JSON.parse(raw);
    return {
      added: Array.isArray(parsed.added) ? parsed.added : [],
      archivedIds: Array.isArray(parsed.archivedIds) ? parsed.archivedIds : [],
    };
  } catch {
    return { added: [], archivedIds: [] };
  }
}

export function saveUserFunds(overlay) {
  try {
    localStorage.setItem(FUNDS_STORAGE_KEY, JSON.stringify({
      added: overlay.added || [],
      archivedIds: overlay.archivedIds || [],
    }));
  } catch {}
}

// ─── Merge / effective list ────────────────────────────────────────
/**
 * Merge the seed list with the user overlay, applying archive flags.
 *
 * @param {object} overlay  { added, archivedIds } from loadUserFunds()
 * @returns {Array} full fund list (seed + added), each with `archived` resolved.
 *                  This is the COMPLETE universe — used by "manage funds" UI.
 */
export function mergeFunds(overlay = { added: [], archivedIds: [] }) {
  const archived = new Set(overlay.archivedIds || []);
  const added = overlay.added || [];
  // Added funds may shadow a seed id (defensive — normally ids are unique).
  const addedIds = new Set(added.map(f => f.id));
  const seed = DEFAULT_FUNDS.filter(f => !addedIds.has(f.id));
  return [...seed, ...added].map(f => ({ ...f, archived: archived.has(f.id) }));
}

/**
 * The EFFECTIVE fund list = merged universe minus archived funds.
 * This is what signal cards, P/E, dip scoring, and the goal fund-picker consume.
 *
 * @param {object} overlay  { added, archivedIds }
 * @returns {Array} non-archived funds
 */
export function effectiveFunds(overlay = { added: [], archivedIds: [] }) {
  return mergeFunds(overlay).filter(f => !f.archived);
}

/**
 * Add a user fund to the overlay (pure — returns a new overlay).
 * Generates a stable id from the name if none supplied. `searchQ` defaults to the name.
 */
export function addFund(overlay, { id, name, category, index, searchQ, goals }) {
  const trimmed = (name || '').trim();
  if (!trimmed) return overlay; // ignore empty
  const fundId = id || makeFundId(trimmed, overlay);
  const fund = {
    id: fundId,
    name: trimmed,
    searchQ: (searchQ || trimmed).trim(),
    goals: goals || [],
    category: category || 'Flexi Cap',
    index: index || null,
  };
  return { ...overlay, added: [...(overlay.added || []), fund] };
}

/**
 * Archive (soft-delete) a fund by id — pure. Works for seed AND added funds.
 * NEVER removes data; only flags it so it drops out of the effective list.
 */
export function archiveFund(overlay, id) {
  const set = new Set(overlay.archivedIds || []);
  set.add(id);
  return { ...overlay, archivedIds: [...set] };
}

/** Un-archive a fund by id — pure. */
export function restoreFund(overlay, id) {
  return { ...overlay, archivedIds: (overlay.archivedIds || []).filter(x => x !== id) };
}

// Derive a slug-ish unique id from a fund name, avoiding collisions with the
// current universe. e.g. "Quant Active Fund" → "quantactivefund" (+ numeric suffix if taken).
function makeFundId(name, overlay) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'fund';
  const existing = new Set(mergeFunds(overlay).map(f => f.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(base + i)) i++;
  return base + i;
}
