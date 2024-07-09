module.exports = function (app) {
  require('./api')(app);
  require('./health')(app);
  require('./404')(app);
};
