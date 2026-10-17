package io.github.uzumakigojo78_prog.pcparttracker

import java.time.LocalDate
import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class BackupScheduleTest {
    @Test
    fun delayUntilLaterToday() {
        assertEquals(30L, BackupSchedule.initialDelayMinutes(LocalDateTime.of(2026, 10, 16, 8, 30), "09:00"))
    }

    @Test
    fun delayRollsToTomorrowWhenTimePassed() {
        assertEquals(1410L, BackupSchedule.initialDelayMinutes(LocalDateTime.of(2026, 10, 16, 9, 30), "09:00"))
    }

    @Test
    fun folderNameUsesIsoDate() {
        assertEquals("Documents/PCPartTracker/backup-2026-10-16", BackupSchedule.folderName(LocalDate.of(2026, 10, 16)))
    }
}
