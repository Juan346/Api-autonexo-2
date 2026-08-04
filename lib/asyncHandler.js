// Envuelve un handler async para que cualquier rechazo de promesa llegue al
// error handler de Express en vez de convertirse en un unhandledRejection que
// tumba el proceso completo (Node >=15 termina el proceso ante rechazos no
// manejados).
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
