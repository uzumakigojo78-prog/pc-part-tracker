package io.github.uzumakigojo78_prog.pcparttracker

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/** Pure scheduling helpers (java.time only) so they unit-test on the JVM. */
object BackupSchedule {
    /** Minutes from [now] until the next occurrence of [time] ("HH:mm"); today if still ahead, else tomorrow. */
    fun initialDelayMinutes(now: LocalDateTime, time: String): Long {
        var next = now.toLocalDate().atTime(LocalTime.parse(time))
        if (!next.isAfter(now)) next = next.plusDays(1)
        return Duration.between(now, next).toMinutes()
    }

    fun folderName(date: LocalDate): String = "Documents/PCPartTracker/backup-$date"
}
