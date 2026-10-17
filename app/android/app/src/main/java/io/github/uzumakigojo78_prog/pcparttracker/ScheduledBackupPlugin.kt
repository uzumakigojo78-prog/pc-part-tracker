package io.github.uzumakigojo78_prog.pcparttracker

import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit
import org.json.JSONObject

@CapacitorPlugin(name = "ScheduledBackup")
class ScheduledBackupPlugin : Plugin() {
    private companion object {
        const val WORK = "pc-backup"
        const val KEY_SPEC = "spec"
    }

    @PluginMethod
    fun schedule(call: PluginCall) {
        val frequency = call.getString("frequency") ?: "off"
        val time = call.getString("time") ?: "09:00"
        val prefs = BackupStore.prefs(context)
        call.getObject("files")?.let { prefs.edit().putString(BackupStore.KEY_FILES, it.toString()).apply() }
        val wm = WorkManager.getInstance(context)
        if (frequency == "off") {
            wm.cancelUniqueWork(WORK)
            prefs.edit().remove(KEY_SPEC).apply()
            call.resolve()
            return
        }
        try {
            val delay = BackupSchedule.initialDelayMinutes(LocalDateTime.now(), time)
            val request = PeriodicWorkRequestBuilder<BackupWorker>(if (frequency == "weekly") 7L else 1L, TimeUnit.DAYS)
                .setInitialDelay(delay, TimeUnit.MINUTES)
                .build()
            // schedule() runs on every data change; only reset the clock when frequency/time actually changed.
            // (UPDATE keeps the old enqueue time, so a fresh initial delay would fire at the wrong hour.)
            val spec = "$frequency|$time"
            val policy = if (prefs.getString(KEY_SPEC, null) == spec) ExistingPeriodicWorkPolicy.KEEP else ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE
            wm.enqueueUniquePeriodicWork(WORK, policy, request)
            prefs.edit().putString(KEY_SPEC, spec).apply()
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Could not schedule backup", e)
        }
    }

    @PluginMethod
    fun exportNow(call: PluginCall) {
        val files = call.getObject("files") ?: return call.reject("files is required")
        try {
            BackupStore.prefs(context).edit().putString(BackupStore.KEY_FILES, files.toString()).apply()
            val folder = BackupStore.write(context, files)
            call.resolve(JSObject().put("folder", folder))
        } catch (e: Exception) {
            call.reject(e.message ?: "Backup failed", e)
        }
    }

    @PluginMethod
    fun lastResult(call: PluginCall) {
        val prefs = BackupStore.prefs(context)
        val result = JSObject()
        result.put("at", prefs.getString("at", null) ?: JSONObject.NULL)
        result.put("status", prefs.getString("status", null) ?: JSONObject.NULL)
        prefs.getString("error", null)?.let { result.put("error", it) }
        call.resolve(result)
    }
}
