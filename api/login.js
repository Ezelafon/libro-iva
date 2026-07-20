const { checkCredentials, setSessionCookie } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const { username, password } = req.body || {};
  const user = checkCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  setSessionCookie(res, user);
  return res.status(200).json({ ok: true, username: user });
};
