const { getUser } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = getUser(req);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.status(200).json({ username: user });
};
