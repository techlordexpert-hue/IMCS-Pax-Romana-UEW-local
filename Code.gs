/**
 * Holy Spirit Catholic Church · IMCS Pax Romana UEW-Local — backend
 * Runs inside a Google Sheet (Extensions > Apps Script). See SETUP.md.
 *
 * Roles
 *  - admin:   full access
 *  - finance: Finance Secretary, can only use the Finances part (ledger + debts)
 *  - usher:   can only mark Sunday attendance
 * Passwords are stored hashed. The admin can change both passwords, suspend the
 * Finance Secretary and control what they may do from the dashboard (Settings tab).
 */

// ====== EDIT THESE (first-time defaults; change them later from the dashboard) ======
const ADMIN_PASSWORD   = 'change-this-password';
const FINANCE_PASSWORD = 'finance2026';
const USHER_PASSWORD   = 'usher2026';
const FINANCE_EMAIL    = 'finance.secretary@example.com';   // receives each dues submission
const ADMIN_EMAIL      = 'admin@example.com';               // receives help messages
const ORG_NAME         = 'IMCS Pax Romana UEW-Local';
const PHOTO_FOLDER     = 'IMCS UEW Uploads';
// =====================================================================================

const SALT = 'imcs-uew-salt-2026';
const SHEETS = {
  Members: ['id','createdAt','fullName','gender','dob','phone','email','programme','level','indexNumber','residence','parish','diocese','society','sacraments','address','nextOfKinName','nextOfKinRelation','nextOfKinPhone','photoId','source'],
  Dues:    ['id','createdAt','fullName','phone','duesType','amount','paidOn','status'],
  Help:    ['id','createdAt','name','contact','category','message','page','status'],
  Ledger:  ['id','createdAt','date','type','category','description','amount','party','receiptId'],
  Debts:   ['id','createdAt','date','creditor','description','amount','paid','dueDate','status'],
  Updates: ['id','createdAt','title','body','pinned','author'],
  Attendance: ['id','createdAt','date','memberId','name','type','markedBy']
};
const DATE_KEYS = { date: 1, paidOn: 1, dueDate: 1, dob: 1 };
// Columns stored as plain text so Sheets never drops the leading 0 of a phone number or reformats a date
const TEXT_KEYS = { phone: 1, contact: 1, indexNumber: 1, nextOfKinPhone: 1, dob: 1, date: 1, paidOn: 1, dueDate: 1, createdAt: 1 };
let _held = false;   // true while this execution already holds the script lock
function withLock(fn) {
  if (_held) return fn();
  const l = LockService.getScriptLock(); l.waitLock(20000); _held = true;
  try { return fn(); } finally { _held = false; l.releaseLock(); }
}
const PUBLIC_ACTIONS  = ['register','dues','duesStatus','help','updatesList'];
const FINANCE_ACTIONS = ['adminLogin','adminList','adminAdd','adminUpdate','adminDelete','changePassword'];
const USHER_ACTIONS   = ['adminLogin','adminList','attendSet','changePassword'];

function doGet() { return json({ ok: true, service: ORG_NAME + ' backend', time: new Date().toISOString() }); }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents), a = req.action;
    let role = null;
    if (PUBLIC_ACTIONS.indexOf(a) === -1) {
      role = authenticate(req.role, req.password);
      if (role === 'finance') checkFinance(a, req);
      if (role === 'usher' && USHER_ACTIONS.indexOf(a) === -1) throw new Error('Not allowed.');
    }
    switch (a) {
      case 'register':       return json(registerMember(req.member, 'Online form'));
      case 'dues':           return json(submitDues(req.dues));
      case 'duesStatus':     return json(duesStatus(req.id));
      case 'help':           return json(submitHelp(req.help));
      case 'updatesList':    return updatesList();
      case 'adminLogin':     return json(login(role));
      case 'adminList':      return json(listFor(role));
      case 'adminAddMember': return json(registerMember(req.member, 'Admin'));
      case 'adminAdd':       return json(adminAdd(req.sheet, req.record));
      case 'adminUpdate':    return json(updateRow(req.sheet, req.id, req.patch));
      case 'adminDelete':    return json(deleteRow(req.sheet, req.id));
      case 'changePassword': return json(changePassword(role, req.newPassword));
      case 'adminRoleSet':   return json(roleSet(req.target, req.patch));
      case 'attendSet':      return json(attendSet(role, req));
      case 'memberPhoto':    return json(memberPhoto(req.id));
    }
    throw new Error('Unknown action');
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- auth ---------- */
function hash(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SALT + s)); }
function getAuth() {
  const raw = PropertiesService.getScriptProperties().getProperty('AUTH');
  const a = raw ? JSON.parse(raw) : {};
  if (!a.adminHash) a.adminHash = hash(ADMIN_PASSWORD);
  if (!a.fin) a.fin = { hash: hash(FINANCE_PASSWORD), suspended: false, canDelete: true, lastLogin: '' };
  if (!a.ush) a.ush = { hash: hash(USHER_PASSWORD), suspended: false, canBackdate: true, lastLogin: '' };
  return a;
}
function saveAuth(a) { PropertiesService.getScriptProperties().setProperty('AUTH', JSON.stringify(a)); }
function authenticate(role, pw) {
  if (!pw) throw new Error('Wrong password.');
  const a = getAuth();
  if (role === 'finance' || role === 'usher') {
    const acc = role === 'finance' ? a.fin : a.ush;
    if (acc.suspended) throw new Error((role === 'finance' ? 'Finance' : 'Usher') + ' access is suspended. Contact the admin.');
    if (hash(pw) !== acc.hash) throw new Error('Wrong password.');
    return role;
  }
  if (hash(pw) !== a.adminHash) throw new Error('Wrong password.');
  return 'admin';
}
function checkFinance(a, req) {
  if (FINANCE_ACTIONS.indexOf(a) === -1) throw new Error('Not allowed.');
  const money = ['Ledger', 'Debts'];
  if (a === 'adminAdd' && money.indexOf(req.sheet) === -1) throw new Error('Not allowed.');
  if (a === 'adminUpdate' && req.sheet !== 'Debts') throw new Error('Not allowed.');
  if (a === 'adminDelete' && (money.indexOf(req.sheet) === -1 || !getAuth().fin.canDelete)) throw new Error('You do not have permission to delete.');
}
function login(role) {
  const a = getAuth();
  if (role === 'finance') { a.fin.lastLogin = new Date().toISOString(); saveAuth(a); }
  if (role === 'usher')   { a.ush.lastLogin = new Date().toISOString(); saveAuth(a); }
  return { ok: true, role: role, perms: role === 'usher' ? { canBackdate: !!a.ush.canBackdate } : { canDelete: !!a.fin.canDelete } };
}
function changePassword(role, pw) {
  if (!pw || String(pw).length < 8) throw new Error('Use at least 8 characters.');
  const a = getAuth();
  if (role === 'finance') a.fin.hash = hash(pw); else if (role === 'usher') a.ush.hash = hash(pw); else a.adminHash = hash(pw);
  saveAuth(a); return { ok: true };
}
function roleSet(target, p) {
  p = p || {}; const a = getAuth(), acc = target === 'usher' ? a.ush : a.fin;
  if ('suspended' in p) acc.suspended = !!p.suspended;
  if ('canDelete' in p) a.fin.canDelete = !!p.canDelete;
  if ('canBackdate' in p) a.ush.canBackdate = !!p.canBackdate;
  if (p.newPassword) { if (String(p.newPassword).length < 8) throw new Error('Use at least 8 characters.'); acc.hash = hash(p.newPassword); }
  saveAuth(a); return { ok: true };
}
function listFor(role) {
  const a = getAuth();
  if (role === 'finance') {
    const dues = readAll('Dues').filter(d => d.status === 'Confirmed').reduce((t, d) => t + (Number(d.amount) || 0), 0);
    return { ok: true, role: role, perms: { canDelete: !!a.fin.canDelete }, ledger: readAll('Ledger'), debts: readAll('Debts'), duesConfirmed: dues };
  }
  if (role === 'usher') {
    return { ok: true, role: role, perms: { canBackdate: !!a.ush.canBackdate },
      members: readAll('Members').map(m => ({ id: m.id, fullName: m.fullName, level: m.level, society: m.society })),
      attendance: readAll('Attendance') };
  }
  return { ok: true, role: role, members: readAll('Members'), dues: readAll('Dues'), help: readAll('Help'), ledger: readAll('Ledger'), debts: readAll('Debts'), updates: readAll('Updates'), attendance: readAll('Attendance'),
    financeAccess: { suspended: !!a.fin.suspended, canDelete: !!a.fin.canDelete, lastLogin: a.fin.lastLogin },
    usherAccess: { suspended: !!a.ush.suspended, canBackdate: !!a.ush.canBackdate, lastLogin: a.ush.lastLogin } };
}

/* ---------- Sunday attendance ---------- */
function todayGMT() { return Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd'); }
function lastSundayGMT() {
  const d = new Date(todayGMT() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
function attendSet(role, req) {
  const date = String(req.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T12:00:00Z').getUTCDay() !== 0) throw new Error('Pick a Sunday.');
  if (date > todayGMT()) throw new Error('That Sunday has not come yet.');
  if (role === 'usher' && !getAuth().ush.canBackdate && date !== lastSundayGMT()) throw new Error('You can only mark the most recent Sunday.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000); _held = true;
  try {
    if (!req.present) {
      const rid = req.recordId || ('A-' + date + '-' + req.memberId);
      const f = findRow('Attendance', rid); if (f) f.sh.deleteRow(f.row);
      return { ok: true };
    }
    const visitor = !!req.visitor;
    if (!req.name) throw new Error('Missing name.');
    const id = visitor ? 'A-' + date + '-V' + Utilities.getUuid().slice(0, 6).toUpperCase() : 'A-' + date + '-' + req.memberId;
    if (!findRow('Attendance', id)) appendRow('Attendance', { id: id, createdAt: new Date().toISOString(), date: date, memberId: visitor ? 'VISITOR' : req.memberId, name: req.name, type: visitor ? 'Visitor' : 'Member', markedBy: role });
    return { ok: true, id: id };
  } finally { _held = false; lock.releaseLock(); }
}
function memberPhoto(id) {
  const m = readAll('Members').filter(x => x.id === id)[0];
  if (!m || !m.photoId) return { ok: true, photo: '' };
  const blob = DriveApp.getFileById(m.photoId).getBlob();
  return { ok: true, photo: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- sheet helpers ---------- */
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(SHEETS[name]); sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, SHEETS[name].length).setFontWeight('bold').setBackground('#e8eefa');
    SHEETS[name].forEach((h, i) => { if (TEXT_KEYS[h]) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  }
  return sh;
}
function readAll(name) {
  const vals = sheet(name).getDataRange().getValues(), head = vals.shift();
  const tz = Session.getScriptTimeZone();
  return vals.filter(r => r[0] !== '').map(r => { const o = {}; head.forEach((h, i) => {
    const v = r[i];
    o[h] = v instanceof Date ? (DATE_KEYS[h] ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString()) : v;
  }); return o; });
}
function safe(v) { v = v == null ? '' : String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }   // block formula injection
function appendRow(name, obj) {
  withLock(() => {
    const sh = sheet(name), cols = SHEETS[name], r = sh.getLastRow() + 1;
    cols.forEach((h, i) => { if (TEXT_KEYS[h]) sh.getRange(r, i + 1).setNumberFormat('@'); });
    sh.getRange(r, 1, 1, cols.length).setValues([cols.map(c => TEXT_KEYS[c] ? (obj[c] == null ? '' : String(obj[c])) : (typeof obj[c] === 'number' ? obj[c] : safe(obj[c])))]);
  });
  if (name === 'Updates') CacheService.getScriptCache().remove('updates');
}
function findRow(name, id) {
  const sh = sheet(name), ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) if (ids[i][0] === id) return { sh: sh, row: i + 1 };
  return null;
}
function updateRow(name, id, patch) {
  if (!SHEETS[name]) throw new Error('Unknown sheet.');
  const f = findRow(name, id); if (!f) throw new Error('Record not found.');
  const cols = SHEETS[name];
  if (patch.photo) { patch.photoId = saveImage(patch.photo, 'member-' + id); delete patch.photo; }
  Object.keys(patch).forEach(k => {
    const c = cols.indexOf(k);
    if (c > -1 && k !== 'id' && k !== 'createdAt') {
      const cell = f.sh.getRange(f.row, c + 1);
      if (TEXT_KEYS[k]) { cell.setNumberFormat('@'); cell.setValue(String(patch[k] == null ? '' : patch[k])); }
      else cell.setValue(typeof patch[k] === 'number' ? patch[k] : safe(patch[k]));
    }
  });
  if (name === 'Updates') CacheService.getScriptCache().remove('updates');
  return { ok: true };
}
function deleteRow(name, id) {
  if (!SHEETS[name]) throw new Error('Unknown sheet.');
  const f = findRow(name, id); if (!f) throw new Error('Record not found.');
  f.sh.deleteRow(f.row);
  if (name === 'Updates') CacheService.getScriptCache().remove('updates');
  return { ok: true };
}

/* ---------- Drive images ---------- */
function saveImage(dataUrl, prefix) {
  if (!dataUrl) return '';
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl); if (!m) return '';
  if (m[2].length > 1500000) throw new Error('Image is too large.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], prefix + '.jpg');
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

/* ---------- public actions ---------- */
function registerMember(m, source) {
  if (!m || !m.fullName || !m.phone || !m.email) throw new Error('Missing required details.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000); _held = true;
  try {
    const all = readAll('Members');
    const norm = p => String(p).replace(/[\s\-()+]/g, '').replace(/^233/, '0');
    if (all.some(x => norm(x.phone) === norm(m.phone))) throw new Error('This phone number is already registered.');
    if (all.some(x => String(x.email).toLowerCase() === String(m.email).toLowerCase())) throw new Error('This email is already registered.');
    const id = 'IMCS-UEW-' + new Date().getFullYear() + '-' + String(all.length + 1).padStart(4, '0');
    const rec = Object.assign({}, m, { id: id, createdAt: new Date().toISOString(), source: source });
    rec.photoId = saveImage(m.photo, id);
    appendRow('Members', rec);
    return { ok: true, id: id };
  } finally { _held = false; lock.releaseLock(); }
}

function submitDues(d) {
  if (!d || !d.fullName || !d.phone || !d.amount || !d.paidOn) throw new Error('Missing required details.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000); _held = true;
  let id;
  try {
    id = 'RCP-' + new Date().getFullYear() + '-' + String(readAll('Dues').length + 1).padStart(4, '0');
    appendRow('Dues', { id: id, createdAt: new Date().toISOString(), fullName: d.fullName, phone: d.phone, duesType: 'Annual dues', amount: Number(d.amount), paidOn: d.paidOn, status: 'Pending' });
  } finally { _held = false; lock.releaseLock(); }
  try {
    MailApp.sendEmail({ to: FINANCE_EMAIL, subject: '[' + ORG_NAME + '] Annual dues: ' + d.fullName + ' - GHS ' + d.amount,
      body: 'New annual dues reported.\n\nReceipt no.: ' + id + '\nName: ' + d.fullName + '\nMoMo number: ' + d.phone + '\nAmount: GHS ' + d.amount + '\nDate: ' + d.paidOn + '\n\nPlease check MoMo. The admin confirms payments and issues receipts in the dashboard (Dues tab).' });
  } catch (e) {}
  return { ok: true, id: id };
}

function duesStatus(id) {
  const d = readAll('Dues').filter(x => String(x.id).toLowerCase() === String(id || '').trim().toLowerCase())[0];
  if (!d) throw new Error('No payment found with that receipt number.');
  return { ok: true, status: d.status, fullName: d.fullName, amount: d.amount, paidOn: d.paidOn };
}

function submitHelp(h) {
  if (!h || !h.name || !h.message) throw new Error('Missing required details.');
  const id = 'H-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendRow('Help', Object.assign({}, h, { id: id, createdAt: new Date().toISOString(), status: 'New' }));
  try {
    MailApp.sendEmail({ to: ADMIN_EMAIL, subject: '[' + ORG_NAME + '] Help: ' + h.category,
      body: 'From: ' + h.name + ' (' + h.contact + ')\nCategory: ' + h.category + '\n\n' + h.message + '\n\nReply from the admin dashboard (Help tab).' });
  } catch (e) {}
  return { ok: true, id: id };
}

/* Home page updates: cached for 60s, cache is cleared whenever the admin posts, edits or deletes */
function updatesList() {
  const cache = CacheService.getScriptCache(), hit = cache.get('updates');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const list = readAll('Updates').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20)
    .map(u => ({ id: u.id, createdAt: u.createdAt, title: u.title, body: u.body, pinned: u.pinned }));
  const out = JSON.stringify({ ok: true, updates: list });
  cache.put('updates', out, 60);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- admin / finance record creation ---------- */
function adminAdd(name, rec) {
  if (['Ledger', 'Debts', 'Updates'].indexOf(name) === -1) throw new Error('Unknown sheet.');
  const id = (name === 'Ledger' ? 'L-' : name === 'Debts' ? 'DB-' : 'U-') + Utilities.getUuid().slice(0, 8).toUpperCase();
  const row = Object.assign({}, rec, { id: id, createdAt: new Date().toISOString() });
  if (rec.receipt) row.receiptId = saveImage(rec.receipt, 'receipt-' + id);
  if (name === 'Ledger') row.amount = Number(row.amount);
  if (name === 'Debts') { row.amount = Number(row.amount); row.paid = Number(row.paid) || 0; }
  appendRow(name, row);
  return { ok: true, id: id };
}
