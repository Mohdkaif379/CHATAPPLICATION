function ensureAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  next();
}

function ensureGuest(req, res, next) {
  if (req.session.user) {
    return res.redirect('/');
  }

  next();
}

function handleUploadErrors(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Max file size is 10MB.' });
  }

  return next(err);
}

module.exports = {
  ensureAuthenticated,
  ensureGuest,
  handleUploadErrors
};
