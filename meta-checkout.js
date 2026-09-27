(function () {
  window.tymeBoxedTrackInitiateCheckout = function () {
    // Meta Pixel InitiateCheckout Event
    if (typeof fbq === 'function') {
      fbq('track', 'InitiateCheckout', {
        value: 999,
        currency: 'INR'
      });
    }
  };
})();
