module.exports = function (app) {
  require('./api')(app);
  require('./health')(app);
  require('./proxy')(app);
  require('./404')(app);
};
