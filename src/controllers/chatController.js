exports.renderChatPage = (req, res) => {
  res.render('pages/chat', {
    title: 'One-to-One Chat',
    currentUser: req.session.user
  });
};
