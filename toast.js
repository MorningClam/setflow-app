/* =========================================================================
 * Setflow Toast Notification Utility (Canonical Version)
 * ========================================================================= */

const toast = {
  element: null,
  messageElement: null,
  timeoutId: null,

  init: function() {
    this.element = document.getElementById('toast-notification');
    this.messageElement = document.getElementById('toast-message');
    if (!this.element || !this.messageElement) {
      console.error("Toast elements (#toast-notification, #toast-message) not found.");
    }
  },

  /**
   * Shows a toast notification using canonical styles.
   * @param {string} message - The message to display.
   * @param {'success'|'error'} [type='success'] - Type of toast.
   * @param {number} [duration=3000] - Duration in milliseconds.
   */
  show: function(message, type = 'success', duration = 3000) {
    if (!this.element || !this.messageElement) {
      // Fallback alert if elements missing
      console.warn("Toast UI not found, using alert:", message);
      alert(message);
      return;
    }

    clearTimeout(this.timeoutId);

    this.messageElement.textContent = message;

    // Remove previous type classes, apply new one based on canonical names
    this.element.classList.remove('bg-emerald-500', 'bg-red-600'); // Remove specific colors
    if (type === 'error') {
      this.element.classList.add('bg-red-600'); // Canonical error color
    } else {
      this.element.classList.add('bg-emerald-500'); // Canonical success color
    }

    // Show toast using opacity transition
    this.element.classList.remove('opacity-0');
    // Force reflow might be needed for transition if hiding immediately before showing
    // void this.element.offsetWidth;
    this.element.classList.add('opacity-100');


    this.timeoutId = setTimeout(() => {
      this.hide(); // Call hide method
    }, duration);
  },

  /**
   * Hides the currently displayed toast.
   */
  hide: function() {
     if (this.element) {
        this.element.classList.remove('opacity-100');
        this.element.classList.add('opacity-0');
     }
     clearTimeout(this.timeoutId); // Clear timeout if hidden manually
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  toast.init();
});

// Expose globally (optional, but used by inline handlers)
window.toast = toast;

// Export if using as a module elsewhere (though currently used globally)
// export { toast };