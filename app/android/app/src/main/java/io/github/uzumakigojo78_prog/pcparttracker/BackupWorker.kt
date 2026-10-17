package io.github.uzumakigojo78_prog.pcparttracker

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.provider.MediaStore
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import org.json.JSONObject

/** Scheduled backup: writes the latest snapshot saved by ScheduledBackupPlugin.schedule(). */
class BackupWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val files = try { BackupStore.savedFiles(ctx) } catch (e: Exception) { null }
        if (files == null) {
            BackupStore.record(ctx, "failed", "No backup data saved yet")
            return Result.failure()
        }
        return try {
            BackupStore.write(ctx, files)
            Result.success()
        } catch (e: Exception) {
            Result.failure() // write() already recorded the error
        }
    }
}

object BackupStore {
    private const val PREFS = "pc-backup"
    const val KEY_FILES = "files"
    private val NAMES = listOf("watchlist.csv", "builds.csv", "price_history.csv")

    fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun savedFiles(context: Context): JSONObject? = prefs(context).getString(KEY_FILES, null)?.let { JSONObject(it) }

    fun lastStatus(context: Context): String? = prefs(context).getString("status", null)

    fun record(context: Context, status: String, error: String?) {
        prefs(context).edit()
            .putString("at", Instant.now().toString())
            .putString("status", status)
            .putString("error", error)
            .apply()
    }

    /** Writes the three CSVs into today's folder (overwriting same-day files) and records the result. Rethrows on failure. */
    fun write(context: Context, files: JSONObject): String {
        val folder = BackupSchedule.folderName(LocalDate.now())
        try {
            val resolver = context.contentResolver
            val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            for (name in NAMES) {
                val content = files.getString(name) // throws JSONException if missing
                // Reuse a same-day file we created so import still finds "watchlist.csv" rather than "watchlist (1).csv".
                val existing = resolver.query(
                    collection, arrayOf(MediaStore.MediaColumns._ID),
                    "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?",
                    arrayOf("$folder/", name), null,
                )?.use { c -> if (c.moveToFirst()) ContentUris.withAppendedId(collection, c.getLong(0)) else null }
                val uri = existing ?: resolver.insert(collection, ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, "text/csv")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
                }) ?: throw IOException("Could not create $name")
                (resolver.openOutputStream(uri, "wt") ?: throw IOException("Could not open $name")).use { it.write(content.toByteArray()) }
            }
        } catch (e: Exception) {
            record(context, "failed", e.message ?: e.toString())
            throw e
        }
        record(context, "ok", null)
        return folder
    }
}
