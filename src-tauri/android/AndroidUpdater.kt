package io.github.jpluker.deepdive

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

// Only our bundled page can invoke this bridge. URLs and package identity
// come from native code, never from a caller-supplied download URL.
class AndroidUpdater(private val activity: Activity, private val webView: WebView,
  private val trusted: () -> Boolean, private val hasWork: () -> Boolean) {
  private val handler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private val cancelled = AtomicBoolean(false)
  private var busy = false
  private var candidate: JSONObject? = null
  private val directory = File(activity.filesDir, "updates")
  private val apk = File(directory, "update.apk")
  private val metadata = File(directory, "update.json")
  companion object {
    private const val REPO = "https://api.github.com/repos/JPLuker/DeepDive/releases?per_page=100"
    private const val SIGNER = "e729122a7c4ea1ea13385aa29bc5fd9989d57ade818ca4338d21d4123bf18633"
    private const val MAX_BYTES = 150L * 1024 * 1024
  }
  private fun emit(event: String, data: JSONObject) {
    handler.post {
      if (trusted()) webView.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('$event',{detail:$data}))", null)
    }
  }
  private fun respond(id: String, data: JSONObject = JSONObject(), error: String? = null) {
    val reply = JSONObject().put("id", id).put("result", data)
    if (error != null) reply.put("error", error)
    emit("deepdive-update-response", reply)
  }
  private fun progress(state: String, current: Long = 0, total: Long = 0) =
    emit("deepdive-update-progress", JSONObject().put("state", state).put("current", current).put("total", total))
  private fun version(v: String): List<Int>? {
    if (!Regex("[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}").matches(v)) return null
    return v.split('.').map { it.toInt() }
  }
  private fun newer(a: String, b: String): Boolean {
    val aa = version(a) ?: return false
    val bb = version(b) ?: return false
    for (i in 0..2) { if (aa[i] != bb[i]) return aa[i] > bb[i] }
    return false
  }
  private fun installed() = activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "0.0.0"
  private fun connection(address: String, api: Boolean = false): HttpURLConnection {
    var url = URL(address)
    repeat(6) {
      val allowed = if (api) url.host == "api.github.com" else url.host in
        setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")
      require(url.protocol == "https" && allowed && url.userInfo == null && (url.port == -1 || url.port == 443)) { "Untrusted update address." }
      val conn = url.openConnection() as HttpURLConnection
      conn.instanceFollowRedirects = false
      conn.connectTimeout = 20000; conn.readTimeout = 30000
      conn.setRequestProperty("User-Agent", "DeepDive-Android")
      if (api) { conn.setRequestProperty("Accept", "application/vnd.github+json"); conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28") }
      val status = conn.responseCode
      if (status in listOf(301, 302, 303, 307, 308)) {
        val location = conn.getHeaderField("Location") ?: throw IllegalStateException("Missing update redirect.")
        conn.disconnect(); url = URL(url, location)
      } else {
        if (status != 200) { conn.disconnect(); throw IllegalStateException(if (status == 403 || status == 429) "GitHub is busy. Try checking again later." else "Update server returned $status.") }
        return conn
      }
    }
    throw IllegalStateException("Too many update redirects.")
  }
  private fun check(channel: String): JSONObject {
    require(channel in listOf("stable", "testing")) { "Unknown update channel." }
    candidate = null
    val conn = connection(REPO, true)
    val text = try { conn.inputStream.use { input ->
      val out = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(16384)
      while (true) { val n = input.read(buffer); if (n < 0) break
        require(out.size() + n <= 4 * 1024 * 1024) { "Update listing is too large." }
        out.write(buffer, 0, n)
      }
      out.toString("UTF-8")
    } } finally { conn.disconnect() }
    val releases = JSONArray(text)
    val current = installed()
    var best: JSONObject? = null
    for (i in 0 until releases.length()) {
      val release = releases.getJSONObject(i)
      if (release.optBoolean("draft") || (channel == "stable" && release.optBoolean("prerelease"))) continue
      val tag = release.optString("tag_name")
      val match = Regex("v([0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4})(-untested-android)?").matchEntire(tag) ?: continue
      val v = match.groupValues[1]
      if (!newer(v, current) || (best != null && !newer(v, best.getString("version")))) continue
      val assets = release.optJSONArray("assets") ?: continue
      val suffix = if (match.groupValues[2].isNotEmpty()) "-UNTESTED" else ""
      val name = "DeepDive-$v-Android-universal$suffix.apk"
      for (j in 0 until assets.length()) {
        val asset = assets.getJSONObject(j)
        val expectedUrl = "https://github.com/JPLuker/DeepDive/releases/download/$tag/$name"
        val size = asset.optLong("size")
        if (asset.optString("name") != name || asset.optString("browser_download_url") != expectedUrl || size <= 0 || size > MAX_BYTES) continue
        val digest = asset.optString("digest")
        // New GitHub release assets carry a SHA-256 digest. Require it;
        // an incomplete publication is not an installable update.
        if (!Regex("sha256:[a-fA-F0-9]{64}").matches(digest)) continue
        best = JSONObject().put("version", v).put("url", expectedUrl).put("size", size)
          .put("sha256", digest.substringAfter(':').lowercase())
          .put("notes", release.optString("body").take(12000)).put("testing", release.optBoolean("prerelease"))
      }
    }
    candidate = best
    return JSONObject().put("installed", current).put("candidate", best ?: JSONObject.NULL)
      .put("ready", best != null && stagedVersion() == best.optString("version"))
  }
  private fun stagedVersion(): String? = try { JSONObject(metadata.readText()).optString("version").takeIf { apk.isFile } } catch (_: Exception) { null }
  @Suppress("DEPRECATION")
  private fun verify(file: File, target: JSONObject) {
    require(file.length() == target.getLong("size")) { "Update download is incomplete." }
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) } }
    fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
    require(hex(digest.digest()) == target.getString("sha256")) { "Update checksum did not match." }
    val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    val archive = activity.packageManager.getPackageArchiveInfo(file.absolutePath, flags) ?: throw IllegalStateException("Invalid APK.")
    val local = activity.packageManager.getPackageInfo(activity.packageName, flags)
    require(archive.packageName == activity.packageName && archive.versionName == target.getString("version")) { "Wrong update package or version." }
    val newCode = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
    val oldCode = if (Build.VERSION.SDK_INT >= 28) local.longVersionCode else local.versionCode.toLong()
    require(newCode > oldCode && newer(archive.versionName ?: "", installed())) { "This update is not newer than the installed app." }
    fun signers(info: android.content.pm.PackageInfo): Set<String> {
      val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
      return signatures?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet() ?: emptySet()
    }
    require(signers(archive) == setOf(SIGNER) && signers(local) == setOf(SIGNER)) { "Update signing certificate did not match DeepDive." }
  }
  private fun download(target: JSONObject): JSONObject {
    directory.mkdirs()
    val part = File(directory, "update.part")
    part.delete()
    val conn = connection(target.getString("url"))
    try {
      val total = target.getLong("size")
      var count = 0L; var last = 0L
      val deadline = android.os.SystemClock.elapsedRealtime() + 10 * 60 * 1000
      conn.inputStream.use { input -> part.outputStream().use { output ->
        val buffer = ByteArray(65536)
        while (true) {
          if (cancelled.get()) throw IllegalStateException("Download cancelled.")
          require(android.os.SystemClock.elapsedRealtime() < deadline) { "Download timed out. Try again." }
          val n = input.read(buffer); if (n < 0) break
          count += n; require(count <= total && count <= MAX_BYTES) { "Update exceeded its expected size." }
          output.write(buffer, 0, n)
          val now = android.os.SystemClock.elapsedRealtime()
          if (now - last > 200) { progress("downloading", count, total); last = now }
        }
      } }
      if (cancelled.get()) throw IllegalStateException("Download cancelled.")
      progress("verifying", count, total); verify(part, target)
      if (cancelled.get()) throw IllegalStateException("Download cancelled.")
      require(part.renameTo(apk)) { "Couldn't save the update." }
      metadata.writeText(target.toString())
      progress("ready", count, total)
      return JSONObject().put("ready", true).put("version", target.getString("version"))
    } finally { conn.disconnect(); part.delete() }
  }
  @JavascriptInterface fun postMessage(message: String) {
    handler.post {
      if (!trusted()) return@post
      var id = ""
      try {
        val args = JSONObject(message); id = args.getString("id")
        when (args.getString("op")) {
          "cancel" -> { cancelled.set(true); respond(id) }
          "check", "download", "install" -> {
            require(!busy) { "An update operation is already running." }
            val op = args.getString("op")
            if (op == "install") require(!hasWork()) { "Finish or cancel the current dive or scan before installing." }
            if (op == "download") cancelled.set(false)
            busy = true
            executor.execute {
              try {
                val result = when (op) {
                  "check" -> check(args.optString("channel", "testing"))
                  "download" -> download(candidate ?: throw IllegalStateException("Check for updates first."))
                  else -> {
                    val target = JSONObject(metadata.readText()); verify(apk, target)
                    require(candidate?.optString("version") == target.getString("version")) { "Check for updates again before installing." }
                    JSONObject().put("install", true)
                  }
                }
                handler.post {
                  busy = false
                  try {
                    if (op == "install") {
                      require(activity.hasWindowFocus()) { "Open DeepDive to install the update." }
                      require(!hasWork()) { "Finish or cancel the current dive or scan before installing." }
                      if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
                        activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:${activity.packageName}")))
                        result.put("permissionRequired", true)
                      } else {
                        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", apk)
                        activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                      }
                    }
                    respond(id, result)
                  } catch (e: Exception) { respond(id, error = e.message ?: "Couldn't open the installer.") }
                }
              } catch (e: Exception) { handler.post { busy = false; respond(id, error = e.message ?: "Update failed. Try again.") } }
            }
          }
          else -> throw IllegalArgumentException("Unknown update command.")
        }
      } catch (e: Exception) { respond(id, error = e.message ?: "Update failed.") }
    }
  }
  fun close() { cancelled.set(true); executor.shutdownNow() }
}
