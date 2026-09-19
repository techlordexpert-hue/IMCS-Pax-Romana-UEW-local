/**
 * IMCS Pax Romana · UEW Local — backend
 * Runs inside a Google Sheet (Extensions > Apps Script). See SETUP.md.
 *
 * - Saves members, dues and help messages into three sheets
 * - Saves passport pictures and payment screenshots to a Google Drive folder
 * - Emails the Finance Secretary whenever dues are submitted
 * - Emails the admin whenever a help message arrives
 * - Admin actions require ADMIN_PASSWORD (checked here, on the server)
 */

// ====== EDIT THESE ======
const ADMIN_PASSWORD  = 'change-this-password';
const FINANCE_EMAIL   = 'finance.secretary@example.com';   // receives every dues submission
const ADMIN_EMAIL     = 'admin@example.com';               // receives help messages
const ORG_NAME        = 'IMCS Pax Romana UEW';
const PHOTO_FOLDER    = 'IMCS UEW Uploads';
// ========================

const SHEETS = {
  Members: ['id','createdAt','fullName','gender','dob','phone','email','programme','level','indexNumber','residence','parish','diocese','society','sacraments','address','nextOfKinName','nextOfKinRelation','nextOfKinPhone','photoId','source'],
  Dues:    ['id','createdAt','fullName','phone','duesType','amount','paidOn','status'],
  Help:    ['id','createdAt','name','contact','category','message','page','status'],
  Ledger:  ['id','createdAt','date','type','category','description','amount','party','receiptId'],
  Debts:   ['id','createdAt','date','creditor','description','amount','paid','dueDate','status']
};
const PUBLIC_ACTIONS = ['register','dues','duesStatus','help'];

function doGet() {
  return json({ ok: true, service: ORG_NAME + ' backend', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const a = req.action;
    if (PUBLIC_ACTIONS.indexOf(a) === -1) requireAdmin(req.password);
    switch (a) {
      case 'register':       return json(registerMember(req.member, 'Online form'));
      case 'adminAddMember': return json(registerMember(req.member, 'Admin'));
      case 'dues':           return json(submitDues(req.dues));
      case 'duesStatus':     return json(duesStatus(req.id));
      case 'adminAdd':       return json(adminAdd(req.sheet, req.record));
      case 'help':           return json(submitHelp(req.help));
      case 'adminLogin':     return json({ ok: true });
      case 'adminList':      return json({ ok: true, members: readAll('Members'), dues: readAll('Dues'), help: readAll('Help'), ledger: readAll('Ledger'), debts: readAll('Debts') });
      case 'adminUpdate':    return json(updateRow(req.sheet, req.id, req.patch));
      case 'adminDelete':    return json(deleteRow(req.sheet, req.id));
    }
    throw new Error('Unknown action');
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function requireAdmin(pw) {
  if (!pw || pw !== ADMIN_PASSWORD) throw new Error('Wrong password.');
}

/* ---------- sheet helpers ---------- */
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, SHEETS[name].length).setFontWeight('bold').setBackground('#e6f2e9');
  }
  return sh;
}
function readAll(name) {
  const sh = sheet(name), vals = sh.getDataRange().getValues();
  const head = vals.shift();
  return vals.filter(r => r[0] !== '').map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
}
function safe(v) {           // block spreadsheet formula injection
  v = v == null ? '' : String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function appendRow(name, obj) {
  const cols = SHEETS[name];
  sheet(name).appendRow(cols.map(c => (c === 'createdAt' || typeof obj[c] === 'number') ? obj[c] : safe(obj[c])));
}
function findRow(name, id) {
  const sh = sheet(name), ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) if (ids[i][0] === id) return { sh, row: i + 1 };
  return null;
}
function updateRow(name, id, patch) {
  if (!SHEETS[name]) throw new Error('Unknown sheet.');
  const f = findRow(name, id); if (!f) throw new Error('Record not found.');
  const cols = SHEETS[name];
  if (patch.photo) { patch.photoId = saveImage(patch.photo, 'member-' + id); delete patch.photo; }
  Object.keys(patch).forEach(k => {
    const c = cols.indexOf(k);
    if (c > -1 && k !== 'id' && k !== 'createdAt') f.sh.getRange(f.row, c + 1).setValue(typeof patch[k] === 'number' ? patch[k] : safe(patch[k]));
  });
  return { ok: true };
}
function deleteRow(name, id) {
  if (!SHEETS[name]) throw new Error('Unknown sheet.');
  const f = findRow(name, id); if (!f) throw new Error('Record not found.');
  f.sh.deleteRow(f.row);
  return { ok: true };
}

/* ---------- Drive images ---------- */
function saveImage(dataUrl, prefix) {
  if (!dataUrl) return '';
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return '';
  if (m[2].length > 1500000) throw new Error('Image is too large.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], prefix + '.jpg');
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

/* ---------- actions ---------- */
function registerMember(m, source) {
  if (!m || !m.fullName || !m.phone || !m.email) throw new Error('Missing required details.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
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
  } finally { lock.releaseLock(); }
}

function submitDues(d) {
  if (!d || !d.fullName || !d.phone || !d.amount || !d.paidOn) throw new Error('Missing required details.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let id;
  try {
    const n = readAll('Dues').length + 1;
    id = 'RCP-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0');
    appendRow('Dues', { id: id, createdAt: new Date().toISOString(), fullName: d.fullName, phone: d.phone,
      duesType: 'Annual dues', amount: Number(d.amount), paidOn: d.paidOn, status: 'Pending' });
  } finally { lock.releaseLock(); }
  const body =
    'New annual dues reported.\n\n' +
    'Receipt no.: ' + id + '\nName: ' + d.fullName + '\nMoMo number: ' + d.phone + '\n' +
    'Amount: GHS ' + d.amount + '\nDate: ' + d.paidOn + '\n\n' +
    'Please check your MoMo, then confirm it in the admin dashboard (Dues tab).';
  try { MailApp.sendEmail({ to: FINANCE_EMAIL, subject: '[' + ORG_NAME + '] Annual dues: ' + d.fullName + ' - GHS ' + d.amount, body: body }); } catch (e) {}
  return { ok: true, id: id };
}

function duesStatus(id) {
  const d = readAll('Dues').filter(x => String(x.id).toLowerCase() === String(id || '').trim().toLowerCase())[0];
  if (!d) throw new Error('No payment found with that receipt number.');
  return { ok: true, status: d.status, fullName: d.fullName, amount: d.amount, paidOn: d.paidOn };
}

function adminAdd(name, rec) {
  if (name !== 'Ledger' && name !== 'Debts') throw new Error('Unknown sheet.');
  const id = (name === 'Ledger' ? 'L-' : 'DB-') + Utilities.getUuid().slice(0, 8).toUpperCase();
  const row = Object.assign({}, rec, { id: id, createdAt: new Date().toISOString() });
  if (rec.receipt) row.receiptId = saveImage(rec.receipt, 'receipt-' + id);
  if (name === 'Ledger') row.amount = Number(row.amount);
  if (name === 'Debts') { row.amount = Number(row.amount); row.paid = Number(row.paid) || 0; }
  appendRow(name, row);
  return { ok: true, id: id };
}

function submitHelp(h) {
  if (!h || !h.name || !h.message) throw new Error('Missing required details.');
  const id = 'H-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendRow('Help', Object.assign({}, h, { id: id, createdAt: new Date().toISOString(), status: 'New' }));
  try {
    MailApp.sendEmail({ to: ADMIN_EMAIL, subject: '[' + ORG_NAME + '] Help: ' + h.category,
      body: 'From: ' + h.name + ' (' + h.contact + ')\nCategory: ' + h.category + '\n\n' + h.message + '\n\nReply from the admin dashboard (Help tab).' });
  } catch (e) { /* email quota; the message is still saved */ }
  return { ok: true, id: id };
}
