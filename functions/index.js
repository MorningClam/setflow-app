/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// --- Callable Function for Atomic Account Deletion ---
exports.deleteAccountAtomic = onCall(async (request) => {
  // 1. Check authentication context
  if (!request.auth) {
    logger.error("Unauthenticated call to deleteAccountAtomic");
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const uid = request.auth.uid;
  logger.info(`Attempting to delete account for UID: ${uid}`);

  // 2. Delete Firestore data associated with the user
  //    IMPORTANT: This is a basic example. A production app needs a comprehensive
  //    strategy to delete ALL user-owned data (gigs, applications, messages, etc.)
  //    This might involve querying collections or using specific document IDs.
  //    For this prototype, we'll delete the main user document.
  const userDocRef = db.collection("users").doc(uid);

  try {
    // Start a batch write for atomicity (though more complex deletions might need multiple steps)
    const batch = db.batch();

    // Delete the user document
    batch.delete(userDocRef);

    // Add deletions for other user-owned data here (e.g., gigs, gear_listings)
    // Example: Delete gigs owned by the user
    const gigsRef = db.collection("gigs");
    const gigsQuery = gigsRef.where("ownerId", "==", uid);
    const gigsSnapshot = await gigsQuery.get();
    gigsSnapshot.forEach((doc) => batch.delete(doc.ref));
    logger.info(`Marked ${gigsSnapshot.size} gigs for deletion.`);

    // Example: Delete gear listings owned by the user
    const listingsRef = db.collection("gear_listings");
    const listingsQuery = listingsRef.where("sellerId", "==", uid);
    const listingsSnapshot = await listingsQuery.get();
    listingsSnapshot.forEach((doc) => batch.delete(doc.ref));
    logger.info(`Marked ${listingsSnapshot.size} gear listings for deletion.`);

    // Commit Firestore deletions
    await batch.commit();
    logger.info(`Successfully deleted Firestore data for UID: ${uid}`);

    // 3. Delete the Firebase Auth user
    await admin.auth().deleteUser(uid);
    logger.info(`Successfully deleted Auth user for UID: ${uid}`);

    return { success: true, message: "Account deleted successfully." };
  } catch (error) {
    logger.error(`Error deleting account for UID: ${uid}`, error);

    // Basic rollback attempt (in more complex scenarios, consider compensation logic)
    // If Auth deletion failed after Firestore deletion, log it. Recreating data is hard.
    if (error.code === "auth/user-not-found") {
      // Auth user might already be deleted if function retried after partial success.
      logger.warn(`Auth user ${uid} not found, possibly already deleted.`);
      return { success: true, message: "Account likely deleted." };
    }

    // If Firestore deletion failed, Auth user wasn't deleted yet.
    throw new HttpsError(
      "internal",
      "Failed to delete account data. Please try again.",
      error.message, // Include original error for debugging if needed
    );
  }
});