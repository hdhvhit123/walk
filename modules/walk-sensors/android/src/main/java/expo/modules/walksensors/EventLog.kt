package expo.modules.walksensors

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile

/**
 * Append-only JSON-lines log per session, shared by the tracking service and
 * the JS side. File order is the replay order; it survives the JS process
 * being killed while the foreground service keeps recording.
 */
object EventLog {
  fun dir(ctx: Context): File = File(ctx.filesDir, "walk-sessions").apply { mkdirs() }
  fun file(ctx: Context, sessionId: String): File = File(dir(ctx), "${safe(sessionId)}.jsonl")

  private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9_-]"), "_")

  @Synchronized
  fun append(ctx: Context, sessionId: String, json: JSONObject) {
    file(ctx, sessionId).appendText(json.toString() + "\n")
  }

  @Synchronized
  fun appendRaw(ctx: Context, sessionId: String, line: String) {
    // Validate before writing so a bad line can never corrupt the log.
    JSONObject(line)
    file(ctx, sessionId).appendText(line.trim() + "\n")
  }

  /** Complete lines from a byte offset; returns the lines and the new offset. */
  @Synchronized
  fun read(ctx: Context, sessionId: String, fromOffset: Long): Pair<List<String>, Long> {
    val f = file(ctx, sessionId)
    if (!f.exists()) return Pair(emptyList(), 0L)
    RandomAccessFile(f, "r").use { raf ->
      val start = fromOffset.coerceIn(0L, raf.length())
      raf.seek(start)
      val bytes = ByteArray((raf.length() - start).toInt())
      raf.readFully(bytes)
      val text = String(bytes, Charsets.UTF_8)
      val lastNl = text.lastIndexOf('\n')
      if (lastNl < 0) return Pair(emptyList(), start)
      val complete = text.substring(0, lastNl)
      val lines = complete.split('\n').filter { it.isNotBlank() }
      return Pair(lines, start + complete.toByteArray(Charsets.UTF_8).size + 1)
    }
  }

  fun delete(ctx: Context, sessionId: String) { file(ctx, sessionId).delete() }

  fun deleteAll(ctx: Context) { dir(ctx).listFiles()?.forEach { it.delete() } }

  /**
   * The session the tracking service is recording, in memory only. If the OS
   * kills the process, this is gone with it, so the app sees "not recording"
   * and treats the time since the last event as a gap instead of assuming
   * evidence is still being collected.
   */
  @Volatile var active: String? = null
}
