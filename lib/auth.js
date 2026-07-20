// Autenticación simple de 2 usuarios fijos, sin base de usuarios.
// Las contraseñas viven SOLO en variables de entorno de Vercel, nunca en el código.
const crypto = require('crypto');

const USERS = {
  eze: process.env.AUTH_EZE_PASS,
  contador: process.env.AUTH_CONTADOR_PASS
};
const SESSION_DAYS = 30;

function sign(payload){
  const secret = process.env.SESSION_SECRET || '';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function checkCredentials(username, password){
  const u = (username || '').toLowerCase().trim();
  const expected = USERS[u];
  if(!expected || !password) return null;
  return password === expected ? u : null;
}

function makeToken(username){
  const payload = Buffer.from(JSON.stringify({ u: username, t: Date.now() })).toString('base64url');
  const sig = sign(payload);
  return payload + '.' + sig;
}

function verifyToken(token){
  if(!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if(sign(payload) !== sig) return null;
  try{
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const ageDays = (Date.now() - data.t) / (1000 * 60 * 60 * 24);
    if(ageDays > SESSION_DAYS) return null;
    if(!USERS[data.u]) return null; // usuario eliminado/desconocido
    return data.u;
  }catch(e){ return null; }
}

function parseCookies(req){
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if(idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function getUser(req){
  const cookies = parseCookies(req);
  return verifyToken(cookies.session);
}

function requireAuth(req, res){
  const user = getUser(req);
  if(!user){
    res.status(401).json({ error: 'No autenticado' });
    return null;
  }
  return user;
}

function setSessionCookie(res, username){
  const token = makeToken(username);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`);
}

function clearSessionCookie(res){
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
}

module.exports = { checkCredentials, getUser, requireAuth, setSessionCookie, clearSessionCookie };
