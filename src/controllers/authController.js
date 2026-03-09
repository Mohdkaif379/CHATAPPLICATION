const authService = require('../services/authService');

exports.renderSignup = (req, res) => {
  res.render('pages/signup', { title: 'Signup', error: null });
};

exports.renderLogin = (req, res) => {
  res.render('pages/login', { title: 'Login', error: null });
};

exports.signup = async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authService.createUser({ username, password });

    if (!result.ok) {
      return res.status(400).render('pages/signup', { title: 'Signup', error: result.message });
    }

    req.session.user = result.user;
    return res.redirect('/');
  } catch (error) {
    return res.status(500).render('pages/signup', {
      title: 'Signup',
      error: 'Something went wrong while creating account.'
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authService.validateUser({ username, password });

    if (!result.ok) {
      return res.status(401).render('pages/login', { title: 'Login', error: result.message });
    }

    req.session.user = result.user;
    return res.redirect('/');
  } catch (error) {
    return res.status(500).render('pages/login', {
      title: 'Login',
      error: 'Something went wrong while logging in.'
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
};
