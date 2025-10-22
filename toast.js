/* =========================================================================
 * Setflow Toast Notification Utility
 * ========================================================================= */

const toast = {
  element: null,
  messageElement: null,
  timeoutId: null,

  /**
   * Initializes the toast utility by finding the necessary elements.
   * Should be called once the DOM is ready.
   */
  init: function() {
    this.element = document.getElementById('toast-notification');
    this.messageElement = document.getElementById('toast-message');
    if (!this.element || !this.messageElement) {
      console.error("Toast notification elements not found in the DOM.");
    }
  },

  /**
   * Shows a toast notification.
   * @param {string} message - The message to display.
   * @param {string} type - 'success' (default) or 'error'.
   * @param {number} duration - How long to show the toast in milliseconds (default: 3000).
   */
  show: function(message, type = 'success', duration = 3000) {
    if (!this.element || !this.messageElement) {
      // Fallback to alert if toast elements aren't found
      console.warn("Toast UI not found, falling back to alert for message:", message);
      alert(message);
      return;
    }

    // Clear any existing timeout
    clearTimeout(this.timeoutId);

    // Set message and type class
    this.messageElement.textContent = message;
    this.element.classList.remove('toast-success', 'toast-error');
    if (type === 'error') {
      this.element.classList.add('toast-error');
    } else {
      this.element.classList.add('toast-success');
    }

    // Show toast
    this.element.classList.remove('opacity-0');
    this.element.classList.add('opacity-100');

    // Set timeout to hide
    this.timeoutId = setTimeout(() => {
      this.element.classList.remove('opacity-100');
      this.element.classList.add('opacity-0');
    }, duration);
  }
};

// Initialize toast when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  toast.init();
});

// Make toast globally accessible (or manage through modules if preferred)
window.toast = toast;