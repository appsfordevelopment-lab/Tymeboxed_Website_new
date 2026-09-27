// Checkout moved to Amazon, so there is no on-site cart any more.
// This clears any cart state left over from the Shopify buy button and keeps
// the floating cart button hidden. The markup stays in place so the cart can be
// restored later if we ever sell direct again.
(function () {
  ['tymeboxed_cart_qty', 'tymeboxed_cart_id'].forEach(function (key) {
    try { localStorage.removeItem(key); } catch (e) {}
  });
  try { sessionStorage.removeItem('tymeboxed_open_cart'); } catch (e) {}

  var fab = document.getElementById('cart-fab');
  if (fab) {
    fab.classList.remove('visible');
    fab.setAttribute('hidden', '');
    fab.style.display = 'none';
  }
})();
