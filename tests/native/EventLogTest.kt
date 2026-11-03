import android.content.ContextWrapper
import expo.modules.walksensors.EventLog
import org.json.JSONObject
import java.io.File

class FakeCtx(val dir: File) : ContextWrapper(null) { override fun getFilesDir() = dir }

fun check(c: Boolean, m: String) { if (!c) throw AssertionError(m); println("ok  $m") }

fun main() {
  val d = kotlin.io.path.createTempDirectory().toFile()
  val ctx = FakeCtx(d)
  check(EventLog.read(ctx, "s1", 0).first.isEmpty(), "missing log reads empty")
  EventLog.append(ctx, "s1", JSONObject().put("kind", "step").put("t", 1))
  EventLog.appendRaw(ctx, "s1", """{"kind":"pause","t":2,"msg":"Tiếng Việt"}""")
  val (l1, o1) = EventLog.read(ctx, "s1", 0)
  check(l1.size == 2 && l1[1].contains("Tiếng Việt"), "two lines incl. UTF-8")
  check(o1 == EventLog.file(ctx, "s1").length(), "offset = file length (bytes, not chars)")
  // Torn write: half a line with no newline must not be returned or consumed.
  EventLog.file(ctx, "s1").appendText("""{"kind":"fix","t":3""")
  val (l2, o2) = EventLog.read(ctx, "s1", o1)
  check(l2.isEmpty() && o2 == o1, "torn line not consumed")
  EventLog.file(ctx, "s1").appendText(""","lat":1,"lng":2,"acc":5}""" + "\n")
  val (l3, o3) = EventLog.read(ctx, "s1", o2)
  check(l3.size == 1 && JSONObject(l3[0]).getInt("t") == 3, "completed line read once from offset")
  check(EventLog.read(ctx, "s1", o3).first.isEmpty(), "nothing new after offset")
  check(EventLog.read(ctx, "s1", 0).first.size == 3, "full replay from 0")
  check(EventLog.read(ctx, "s1", 999999).let { it.first.isEmpty() }, "offset past end is clamped")
  val bad = runCatching { EventLog.appendRaw(ctx, "s1", "not json") }
  check(bad.isFailure && EventLog.read(ctx, "s1", 0).first.size == 3, "invalid JSON rejected, log untouched")
  EventLog.append(ctx, "../evil", JSONObject().put("kind", "x"))
  check(File(d, "walk-sessions/___evil.jsonl").exists() && !File(d, "evil.jsonl").exists(), "session id sanitised (no path traversal)")
  EventLog.delete(ctx, "s1")
  check(!EventLog.file(ctx, "s1").exists(), "delete one")
  EventLog.deleteAll(ctx)
  check(EventLog.dir(ctx).listFiles()!!.isEmpty(), "delete all")
  // Concurrent appends from two threads keep every line intact.
  val ts = (1..2).map { k -> Thread { repeat(500) { i -> EventLog.append(ctx, "c", JSONObject().put("k", k).put("i", i)) } } }
  ts.forEach { it.start() }; ts.forEach { it.join() }
  val all = EventLog.read(ctx, "c", 0).first
  check(all.size == 1000 && all.all { runCatching { JSONObject(it) }.isSuccess }, "1000 concurrent appends, all valid")
  println("ALL PASS")
}
