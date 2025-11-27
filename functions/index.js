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

// --- Callable Function: Atomic Account Deletion ---
exports.deleteAccountAtomic = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const userDocRef = db.collection("users").doc(uid);

  try {
    const batch = db.batch();
    batch.delete(userDocRef);

    // Cleanup user-owned data
    const gigsQuery = db.collection("gigs").where("ownerId", "==", uid);
    const gigsSnapshot = await gigsQuery.get();
    gigsSnapshot.forEach((doc) => batch.delete(doc.ref));

    const listingsQuery = db.collection("gear_listings").where("sellerId", "==", uid);
    const listingsSnapshot = await listingsQuery.get();
    listingsSnapshot.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
    await admin.auth().deleteUser(uid);

    return { success: true, message: "Account deleted successfully." };
  } catch (error) {
    logger.error(`Error deleting account for UID: ${uid}`, error);
    throw new HttpsError("internal", "Failed to delete account data.", error.message);
  }
});

// --- Callable Function: Secure Booking Transaction ---
exports.confirmBooking = onCall(async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { gigId, artistId, artistName } = request.data;
    const gigRef = db.collection('gigs').doc(gigId);

    // 2. Run Transaction (Prevents Race Conditions)
    await db.runTransaction(async (t) => {
        const gigDoc = await t.get(gigRef);
        
        if (!gigDoc.exists) {
            throw new HttpsError('not-found', 'Gig not found.');
        }

        const gigData = gigDoc.data();

        // 3. Security Check: Only Owner can book
        if (gigData.ownerId !== request.auth.uid) {
            throw new HttpsError('permission-denied', 'Only the gig owner can confirm bookings.');
        }

        // 4. Availability Check
        if (gigData.status !== 'open') {
            throw new HttpsError('failed-precondition', 'This gig is no longer available.');
        }

        // 5. Execute Updates
        // Update Gig Status
        t.update(gigRef, {
            status: 'booked',
            bookedArtistId: artistId,
            bookedArtistName: artistName,
            bookedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create Calendar Event for the Artist
        // (Server-side creation bypasses the "Venue writing to Artist Calendar" permission rule)
        const eventRef = db.collection('calendarEvents').doc(); 
        t.set(eventRef, {
            userId: artistId,
            type: 'gig',
            title: `Gig at ${gigData.venueName}`,
            dateTime: gigData.date, // Use the actual Gig Date
            notes: `Confirmed booking. Payout: $${gigData.payout}`,
            gigId: gigId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});

// --- NOTIFICATION TRIGGERS ---

exports.notifyVenueOnApplication = onDocumentCreated("applications/{appId}", async (event) => {
    const appData = event.data.data();
    const gigId = appData.gigId;
    const applicantId = appData.userId;

    try {
        const gigDoc = await db.collection("gigs").doc(gigId).get();
        const gigData = gigDoc.data();
        const ownerId = gigData.ownerId;

        const applicantDoc = await db.collection("users").doc(applicantId).get();
        const applicantName = applicantDoc.data().name || "A musician";

        await db.collection("users").doc(ownerId).collection("notifications").add({
            type: "new_application",
            text: `${applicantName} applied for ${gigData.venueName}`,
            link: `setflow-review-applicants.html?gigId=${gigId}&gigName=${encodeURIComponent(gigData.venueName)}`,
            isUnread: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        logger.error("Error sending application notification", err);
    }
});

exports.notifyMusicianOnBooking = onDocumentUpdated("gigs/{gigId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    // Trigger only when status changes to 'booked'
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
            } catch (err) {
                logger.error("Error sending booking notification", err);
            }
        }
    }
});