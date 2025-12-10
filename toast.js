/* =========================================================================
 * Setflow Toast Notification Utility (Canonical Class-Based Version)
 * ========================================================================= */

const toast = {
  element: null,
  timeoutId: null,

  init: function() {
    this.element = document.getElementById('toast-notification');
    if (!this.element) {
      // Auto-create if missing (failsafe)
      this.element = document.createElement('div');
      this.element.id = 'toast-notification';
      document.body.appendChild(this.element);
    }
  },

  /**
   * Shows a toast notification.
   * @param {string} message - The message to display.
   * @param {'success'|'error'} [type='success'] - Type of toast.
   * @param {number} [duration=3000] - Duration in milliseconds.
   */
  show: function(message, type = 'success', duration = 3000) {
    if (!this.element) this.init();

    clearTimeout(this.timeoutId);

    // Set Text
    this.element.textContent = message;

    // Reset Classes
    this.element.className = ''; // Wipe all classes
    
    // Add Base ID (for CSS targeting if needed, though ID handles most)
    // Add Type Class (Defined in styles.css)
    if (type === 'error') {
      this.element.classList.add('toast-error');
    } else {
      this.element.classList.add('toast-success');
    }

    // Trigger Animation (Reflow hack to restart CSS transition if needed)
    void this.element.offsetWidth; 
    
    // Add 'show' class to trigger CSS opacity/transform
    this.element.classList.add('show');

    // Auto Hide
    this.timeoutId = setTimeout(() => {
      this.hide();
    }, duration);
  },

  hide: function() {
     if (this.element) {
        this.element.classList.remove('show');
     }
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  toast.init();
});

// Expose globally
window.toast = toast;