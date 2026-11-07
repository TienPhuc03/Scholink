package com.scholink.app

import android.Manifest
import android.app.NotificationManager
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/**
 * Device services for F29 (NOTI-03/04): device calendar events with reminders and the Android 13
 * notification permission. Dart side: lib/core/device/device_services.dart.
 */
class MainActivity : FlutterActivity() {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val pendingPermission = mutableMapOf<Int, MethodChannel.Result>()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            handle(call, result)
        }
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "calendarPermissionGranted" -> result.success(hasCalendarPermission())
            "requestCalendarPermission" -> {
                if (hasCalendarPermission()) result.success(true)
                else askPermissions(REQ_CALENDAR, arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR), result)
            }
            "notificationPermissionGranted" -> result.success(notificationsAllowed())
            "requestNotificationPermission" -> {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationsAllowed()) {
                    result.success(notificationsAllowed())
                } else {
                    askPermissions(REQ_NOTIFICATIONS, arrayOf(Manifest.permission.POST_NOTIFICATIONS), result)
                }
            }
            "upsertCalendarEvent" -> withCalendar(result) { upsertEvent(call) }
            "calendarEventExists" -> withCalendar(result) { eventExists(call.longArg("eventId")) }
            "deleteCalendarEvent" -> withCalendar(result) { deleteEvent(call.longArg("eventId")) }
            else -> result.notImplemented()
        }
    }

    // ---------------- Permissions ----------------

    private fun hasCalendarPermission(): Boolean =
        checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED

    private fun notificationsAllowed(): Boolean {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) return false
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    private fun askPermissions(requestCode: Int, permissions: Array<String>, result: MethodChannel.Result) {
        // A second request while the dialog is open answers the first one as refused.
        pendingPermission.remove(requestCode)?.success(false)
        pendingPermission[requestCode] = result
        requestPermissions(permissions, requestCode)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val result = pendingPermission.remove(requestCode) ?: return
        val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        result.success(granted)
    }

    // ---------------- Calendar ----------------

    /** Runs a ContentResolver job off the UI thread; never reports success without permission. */
    private fun withCalendar(result: MethodChannel.Result, job: () -> Any?) {
        if (!hasCalendarPermission()) {
            result.error("PERMISSION_DENIED", "Chưa được cấp quyền truy cập lịch thiết bị.", null)
            return
        }
        io.execute {
            try {
                val value = job()
                main.post { result.success(value) }
            } catch (e: NoCalendarException) {
                main.post { result.error("NO_CALENDAR", e.message, null) }
            } catch (e: SecurityException) {
                main.post { result.error("PERMISSION_DENIED", e.message ?: "Không có quyền ghi lịch.", null) }
            } catch (e: Exception) {
                main.post { result.error("CALENDAR_ERROR", e.message ?: "Không ghi được lịch thiết bị.", null) }
            }
        }
    }

    private class NoCalendarException(message: String) : Exception(message)

    private fun MethodCall.longArg(name: String): Long =
        (argument<Any>(name) as? Number)?.toLong() ?: throw IllegalArgumentException("Thiếu $name")

    /** Primary calendar the user can write to, otherwise the first writable visible one. */
    private fun writableCalendarId(): Long {
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.IS_PRIMARY,
        )
        val selection = "${CalendarContract.Calendars.VISIBLE} = 1 AND " +
            "${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= ${CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR}"
        contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, selection, null, null)?.use { c ->
            var fallback: Long? = null
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val primary = !c.isNull(1) && c.getInt(1) == 1
                if (primary) return id
                if (fallback == null) fallback = id
            }
            if (fallback != null) return fallback
        }
        throw NoCalendarException("Không có lịch nào trên thiết bị cho phép ghi sự kiện. Hãy thêm tài khoản lịch rồi thử lại.")
    }

    private fun eventExists(eventId: Long): Boolean {
        val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId)
        contentResolver.query(uri, arrayOf(CalendarContract.Events._ID, CalendarContract.Events.DELETED), null, null, null)?.use { c ->
            if (c.moveToFirst()) return c.isNull(1) || c.getInt(1) == 0
        }
        return false
    }

    private fun deleteEvent(eventId: Long): Boolean {
        val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId)
        return contentResolver.delete(uri, null, null) > 0
    }

    private fun upsertEvent(call: MethodCall): Long {
        val title = call.argument<String>("title") ?: "Scholink"
        val description = call.argument<String>("description") ?: ""
        val start = call.longArg("startMillis")
        val end = (call.argument<Any>("endMillis") as? Number)?.toLong() ?: start
        val timezone = call.argument<String>("timezone") ?: java.util.TimeZone.getDefault().id
        val reminders = (call.argument<List<Any>>("reminderMinutes") ?: emptyList())
            .mapNotNull { (it as? Number)?.toInt() }
            .filter { it >= 0 }
            .distinct()
        val existing = (call.argument<Any>("eventId") as? Number)?.toLong()

        val values = ContentValues().apply {
            put(CalendarContract.Events.TITLE, title)
            put(CalendarContract.Events.DESCRIPTION, description)
            put(CalendarContract.Events.DTSTART, start)
            put(CalendarContract.Events.DTEND, maxOf(end, start))
            put(CalendarContract.Events.EVENT_TIMEZONE, timezone)
            put(CalendarContract.Events.HAS_ALARM, if (reminders.isEmpty()) 0 else 1)
        }

        val eventId: Long = if (existing != null && eventExists(existing)) {
            contentResolver.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, existing), values, null, null)
            existing
        } else {
            values.put(CalendarContract.Events.CALENDAR_ID, writableCalendarId())
            val uri = contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
                ?: throw IllegalStateException("Lịch thiết bị từ chối tạo sự kiện.")
            ContentUris.parseId(uri)
        }

        // Replace the alarms so a re-sync with other milestones never stacks duplicates.
        contentResolver.delete(
            CalendarContract.Reminders.CONTENT_URI,
            "${CalendarContract.Reminders.EVENT_ID} = ?",
            arrayOf(eventId.toString()),
        )
        for (minutes in reminders) {
            val reminder = ContentValues().apply {
                put(CalendarContract.Reminders.EVENT_ID, eventId)
                put(CalendarContract.Reminders.MINUTES, minutes)
                put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
            }
            contentResolver.insert(CalendarContract.Reminders.CONTENT_URI, reminder)
        }
        return eventId
    }

    companion object {
        private const val CHANNEL = "com.scholink.app/device"
        private const val REQ_CALENDAR = 4101
        private const val REQ_NOTIFICATIONS = 4102
    }
}
