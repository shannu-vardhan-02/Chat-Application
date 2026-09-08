/**
 * db.js — Charchalu local IndexedDB database (via Dexie.js)
 *
 * WHY DEXIE:
 *   - Promise-based API (native IndexedDB is callback hell)
 *   - Schema versioning with auto-migrations (db.version(N).stores())
 *   - liveQuery() for reactive subscriptions
 *   - Excellent performance for indexed queries
 *
 * STORES:
 *
 *   messages — Every message we've seen (sent or received).
 *     Primary key: auto-increment `id` (IDB internal)
 *     Indexed: clientId (idempotency), conversationKey (fast lookup), createdAt, syncStatus
 *
 *   conversations — Sidebar state for each chat partner.
 *     Primary key: conversationKey (format: "{minUserId}_{maxUserId}")
 *     Indexed: lastMessageAt (for sidebar sort order)
 *
 * CONVERSATION KEY:
 *   A deterministic string derived from the two participant IDs.
 *   Always uses min_max order so A↔B and B↔A produce the same key.
 *   Example: "64abc_64def"
 *
 * SYNC STATUS on messages:
 *   "synced"  — message confirmed saved on server (has a real MongoDB _id)
 *   "pending" — composed while offline, not yet sent to server
 *   "failed"  — 3 retries exhausted, user must manually retry
 *
 * BACKWARD COMPATIBILITY:
 *   All IDB operations are wrapped in try/catch. If IDB is unavailable
 *   (private browsing mode, quota exceeded, browser restriction), the app
 *   falls back to in-memory Zustand state — identical to the old behaviour.
 */

import Dexie from "dexie";

const db = new Dexie("charchalu_db");

/**
 * Schema version 1 — initial schema.
 *
 * Dexie schema string format: "primaryKey, index1, index2, ..."
 * Prefix "++" means auto-increment integer primary key.
 * Prefix "&" means unique index.
 * No prefix = non-unique index.
 *
 * Fields NOT listed here are still stored; they just can't be queried by index.
 * Only index fields you actually query or sort on (keep indexes minimal).
 */
db.version(1).stores({
  messages: "++id, &clientId, conversationKey, createdAt, syncStatus",
  conversations: "conversationKey, lastMessageAt",
});

/**
 * Helper: Compute the deterministic conversation key for two user IDs.
 * Always produces the same key regardless of argument order.
 *
 * @param {string} userIdA
 * @param {string} userIdB
 * @returns {string}  e.g. "64abc123_64def456"
 */
export function conversationKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join("_");
}

/**
 * Read all cached messages for a conversation from IDB.
 * Returns them in ascending createdAt order (oldest first) — ready to render.
 *
 * @param {string} key  conversationKey(myId, otherId)
 * @returns {Promise<Message[]>}
 */
export async function getLocalMessages(key) {
  try {
    return await db.messages
      .where("conversationKey")
      .equals(key)
      .sortBy("createdAt");
  } catch (e) {
    console.warn("[IDB] getLocalMessages failed:", e);
    return [];
  }
}

/**
 * Upsert a single message into IDB.
 *
 * Uses clientId as the uniqueness key when available (idempotent).
 * Falls back to _id when clientId is absent (messages received via socket).
 *
 * Upsert logic:
 *   1. If clientId exists → try to find existing record by clientId
 *   2. If _id exists and no clientId match → try to find by _id
 *   3. If found → update the record (preserving IDB primary key `id`)
 *   4. If not found → insert a new record
 *
 * @param {Object} message  Partial or full message object
 */
export async function upsertLocalMessage(message) {
  try {
    const key = message.conversationKey ||
      (message.senderId && message.receiverId
        ? conversationKey(message.senderId, message.receiverId)
        : null);

    if (!key) return; // can't store without a conversation key

    const record = { ...message, conversationKey: key };

    // Try to find an existing IDB record to update
    let existing = null;
    if (message.clientId) {
      existing = await db.messages.where("clientId").equals(message.clientId).first();
    }
    if (!existing && message._id) {
      existing = await db.messages.where({ _id: message._id }).first();
    }

    if (existing) {
      // Update in place — preserve `id` (IDB auto-increment key)
      await db.messages.update(existing.id, record);
    } else {
      await db.messages.add(record);
    }
  } catch (e) {
    if (e.name !== "ConstraintError") {
      // ConstraintError on clientId uniqueness = duplicate → silent, expected
      console.warn("[IDB] upsertLocalMessage failed:", e);
    }
  }
}

/**
 * Bulk upsert multiple messages into IDB.
 * Used during delta sync to write many messages at once efficiently.
 *
 * @param {Object[]} messages
 * @param {string}   myId  — logged-in user's _id (needed to derive conversationKey)
 */
export async function bulkUpsertMessages(messages, myId) {
  for (const msg of messages) {
    const otherId = String(msg.senderId) === String(myId) ? msg.receiverId : msg.senderId;
    await upsertLocalMessage({ ...msg, conversationKey: conversationKey(myId, otherId) });
  }
}

/**
 * Get cached conversation metadata (lastMessageAt, etc.) from IDB.
 *
 * @param {string} key  conversationKey
 * @returns {Promise<Object|null>}
 */
export async function getLocalConversation(key) {
  try {
    return await db.conversations.get(key) || null;
  } catch (e) {
    console.warn("[IDB] getLocalConversation failed:", e);
    return null;
  }
}

/**
 * Upsert conversation metadata in IDB.
 * Called after loading messages so we know when we last synced.
 *
 * @param {Object} conv  { conversationKey, lastSyncAt, lastMessageAt, ... }
 */
export async function upsertLocalConversation(conv) {
  try {
    await db.conversations.put(conv);
  } catch (e) {
    console.warn("[IDB] upsertLocalConversation failed:", e);
  }
}

/**
 * Get all messages with syncStatus = "pending".
 * Called by the BackgroundSync service worker to find unsent messages.
 *
 * @returns {Promise<Object[]>}
 */
export async function getPendingMessages() {
  try {
    return await db.messages.where("syncStatus").equals("pending").toArray();
  } catch (e) {
    console.warn("[IDB] getPendingMessages failed:", e);
    return [];
  }
}

/**
 * Mark a message's syncStatus in IDB.
 * Called after successful or failed sync attempt.
 *
 * @param {string} clientId
 * @param {"synced"|"failed"} status
 * @param {Object} serverData  — optional fields from server to merge (e.g. _id, createdAt)
 */
export async function updateMessageSyncStatus(clientId, status, serverData = {}) {
  try {
    const existing = await db.messages.where("clientId").equals(clientId).first();
    if (existing) {
      await db.messages.update(existing.id, { syncStatus: status, ...serverData });
    }
  } catch (e) {
    console.warn("[IDB] updateMessageSyncStatus failed:", e);
  }
}

/**
 * Clear all IDB data for this user (called on logout).
 * Ensures no sensitive data lingers on shared devices.
 */
export async function clearLocalDB() {
  try {
    await db.messages.clear();
    await db.conversations.clear();
  } catch (e) {
    console.warn("[IDB] clearLocalDB failed:", e);
  }
}

export default db;
