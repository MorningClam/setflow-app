/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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

  const userDocRef = db.collection("users").doc(uid);

  try {
    const batch = db.batch();

    // Delete the user document
    batch.delete(userDocRef);

    // Example: Delete gigs owned by the user
    const gigsRef = db.collection("gigs");
    const gigsQuery = gigsRef.where("ownerId", "==", uid);
    const gigsSnapshot = await gigsQuery.get();
    gigsSnapshot.forEach((doc) => batch.delete(doc.ref));

    // Example: Delete gear listings owned by the user
    const listingsRef = db.collection("gear_listings");
    const listingsQuery = listingsRef.where("sellerId", "==", uid);
    const listingsSnapshot = await listingsQuery.get();
    listingsSnapshot.forEach((doc) => batch.delete(doc.ref));

    // Commit Firestore deletions
    await batch.commit();

    // 3. Delete the Firebase Auth user
    await admin.auth().deleteUser(uid);

    return { success: true, message: "Account deleted successfully." };
  } catch (error) {
    logger.error(`Error deleting account for UID: ${uid}`, error);
    if (error.code === "auth/user-not-found") {
      return { success: true, message: "Account likely deleted." };
    }
    throw new HttpsError("internal", "Failed to delete account data.", error.message);
  }
});

// --- NOTIFICATION TRIGGERS ---

/**
 * Trigger: When a musician applies for a gig.
 * Action: Send a notification to the Venue (Gig Owner).
 */
exports.notifyVenueOnApplication = onDocumentCreated("applications/{appId}", async (event) => {
    const appData = event.data.data();
    const gigId = appData.gigId;
    const applicantId = appData.userId;

    try {
        // 1. Get Gig Details to find the Owner
        const gigDoc = await db.collection("gigs").doc(gigId).get();
        const gigData = gigDoc.data();
        const ownerId = gigData.ownerId;

        // 2. Get Applicant Name
        const applicantDoc = await db.collection("users").doc(applicantId).get();
        const applicantName = applicantDoc.data().name || "A musician";

        // 3. Create Notification for Venue
        await db.collection("users").doc(ownerId).collection("notifications").add({
            type: "new_application",
            text: `${applicantName} applied for ${gigData.venueName}`,
            link: `setflow-review-applicants.html?gigId=${gigId}&gigName=${encodeURIComponent(gigData.venueName)}`,
            isUnread: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        logger.info(`Notification sent to venue ${ownerId} for app ${event.params.appId}`);
    } catch (err) {
        logger.error("Error sending application notification", err);
    }
});

/**
 * Trigger: When a Gig is booked (status changes to 'booked').
 * Action: Send a notification to the Musician.
 */
exports.notifyMusicianOnBooking = onDocumentUpdated("gigs/{gigId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    // Only trigger if status changed to 'booked'
    if (oldData.status !== 'booked' && newData.status === 'booked') {
        const musicianId = newData.bookedArtistId;
        const venueName = newData.venueName;

        if (musicianId) {
            try {
                await db.collection("users").doc(musicianId).collection("notifications").add({
                    type: "gig_booked",
                    text: `You've been booked for ${venueName}! 🎉`,
                    link: `setflow-show-sheet.html?gigId=${event.params.gigId}`,
                    isUnread: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                logger.info(`Booking notification sent to musician ${musicianId}`);
            } catch (err) {
                logger.error("Error sending booking notification", err);
            }
        }
    }
});