/* Escape de HTML compartilhado.
 * Use SEMPRE que um dado vindo do banco ou do usuário (nome, depoimento,
 * mensagem, título...) for concatenado numa string que vai para innerHTML,
 * insertAdjacentHTML ou outerHTML. Escapa & < > " ' — seguro tanto em texto
 * quanto dentro de atributos entre aspas. Para texto puro, prefira textContent. */
(function (w) {
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) { return MAP[c]; });
  }
  if (typeof w.escapeHtml !== 'function') w.escapeHtml = escapeHtml;
  w.winEscapeHtml = escapeHtml;
})(window);
