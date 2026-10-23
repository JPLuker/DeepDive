package io.github.jpluker.deepdive

import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.app.Service
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.pm.PackageManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import org.json.JSONObject
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var workWebView: WebView? = null
  private val workHandler = Handler(Looper.getMainLooper())

  private fun bundledPage(): Boolean {
    val uri = android.net.Uri.parse(workWebView?.url ?: return false)
    return uri.host in listOf("tauri.localhost", "localhost") &&
      uri.scheme in listOf("http", "https", "tauri") && uri.path == "/app/index.html"
  }

  private fun reply(id: String, result: Boolean = true, error: String? = null) {
    val detail = JSONObject().put("id", id).put("result", result)
    if (error != null) detail.put("error", error)
    workWebView?.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent('deepdive-background-response',{detail:$detail}))", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    workWebView = webView
    // No credentials or network methods are exposed. The native side
    // checks the current bundled URL before accepting any command.
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun postMessage(message: String) {
        workHandler.post {
          if (!bundledPage()) return@post
          var id = ""
          var jobToken: String? = null
          try {
            val args = JSONObject(message)
            id = args.getString("id")
            when (args.getString("op")) {
              "begin" -> {
                val token = args.getString("token")
                jobToken = token
                if (BackgroundWorkService.instance == null &&
                  !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                  throw IllegalStateException("Open DeepDive to start background work.")
                }
                BackgroundWorkService.onStopped = {
                  workWebView?.evaluateJavascript(
                    "window.dispatchEvent(new Event('deepdive-background-stopped'))", null)
                }
                BackgroundWorkService.ready[token] = { error ->
                  if (error == null) {
                    webView.onResume()
                    webView.resumeTimers()
                  }
                  reply(args.getString("id"), error = error)
                }
                val intent = Intent(this@MainActivity, BackgroundWorkService::class.java)
                  .putExtra("token", token).putExtra("label", args.optString("label").take(100))
                val service = BackgroundWorkService.instance
                if (service != null) service.onStartCommand(intent, 0, 0)
                else ContextCompat.startForegroundService(this@MainActivity, intent)
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(
                    this@MainActivity, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED &&
                    !askedNotifications) {
                  askedNotifications = true
                  ActivityCompat.requestPermissions(this@MainActivity,
                    arrayOf("android.permission.POST_NOTIFICATIONS"), 2041)
                }
              }
              "end" -> {
                BackgroundWorkService.instance?.finish(args.getString("token"))
                if (BackgroundWorkService.instance == null &&
                  !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) webView.onPause()
                reply(id)
              }
              "delay" -> {
                if (BackgroundWorkService.instance == null) throw IllegalStateException("Background work stopped.")
                val delay = args.getLong("ms").coerceIn(0L, 6L * 60 * 60 * 1000)
                workHandler.postDelayed({ reply(args.getString("id")) }, delay)
              }
              else -> throw IllegalArgumentException("Unknown background command")
            }
          } catch (error: Exception) {
            jobToken?.let { BackgroundWorkService.ready.remove(it) }
            reply(id, error = error.message ?: "Background work could not start.")
          }
        }
      }
    }, "DeepDiveBackground")
  }

  private var askedNotifications = false

  override fun onPause() {
    super.onPause()
    // WryActivity.onPause pauses this WebView. A live data-sync service
    // deliberately keeps its JS task engine resumed while UI is hidden.
    if (BackgroundWorkService.instance != null) workWebView?.onResume()
  }

  override fun onDestroy() {
    workHandler.removeCallbacksAndMessages(null)
    BackgroundWorkService.instance?.stopSelf()
    BackgroundWorkService.ready.clear()
    BackgroundWorkService.onStopped = null
    workWebView = null
    super.onDestroy()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // The generated activity enables edge-to-edge without fitting the
    // WebView around system bars. Use the OS measurements, including
    // cutouts, landscape navigation and the keyboard, not a fixed gap.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, windowInsets ->
      val insets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
      // The native container has handled these; do not apply them a
      // second time inside the WebView through CSS safe-area insets.
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}


// The service shares the app process with its WebView task engine. It
// keeps CPU/network work alive, not the display. START_NOT_STICKY avoids
// restarting an empty worker after process death; existing checkpoints
// are the recovery path. Swiping the task away deliberately stops it.
class BackgroundWorkService : Service() {
  companion object {
    var instance: BackgroundWorkService? = null
    val ready = mutableMapOf<String, (String?) -> Unit>()
    var onStopped: (() -> Unit)? = null
    private const val CHANNEL = "deepdive-work"
    private const val NOTIFICATION = 2041
    private const val MAX_RUN_MS = 5L * 60 * 60 * 1000 + 55L * 60 * 1000
  }
  private val jobs = linkedMapOf<String, String>()
  private val handler = Handler(Looper.getMainLooper())
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Scans and dives", NotificationManager.IMPORTANCE_LOW))
    }
    // Also bound older Android releases, which have no FGS timeout callback.
    handler.postDelayed({ expire() }, MAX_RUN_MS)
  }

  private fun notification(): Notification {
    val open = Intent(this, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val tap = PendingIntent.getActivity(this, 0, open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder.setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle("DeepDive is working")
      .setContentText(if (jobs.size == 1) jobs.values.first() else "${jobs.size} jobs running")
      .setContentIntent(tap).setOngoing(true).setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_PROGRESS).build()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val token = intent?.getStringExtra("token")
    if (token == null) { stopSelf(); return START_NOT_STICKY }
    try {
      jobs[token] = intent.getStringExtra("label") ?: "Reading Spotify"
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else startForeground(NOTIFICATION, notification())
      if (wakeLock == null) {
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:work")
          .apply { setReferenceCounted(false); acquire(MAX_RUN_MS) }
      }
      ready.remove(token)?.invoke(null)
    } catch (error: Exception) {
      jobs.remove(token)
      ready.remove(token)?.invoke(error.message ?: "Background work could not start.")
      if (jobs.isEmpty()) stopSelf()
    }
    return START_NOT_STICKY
  }

  fun finish(token: String) {
    jobs.remove(token)
    if (jobs.isEmpty()) {
      // Clear immediately: another begin before onDestroy must start a
      // fresh service rather than attach work to one already stopping.
      instance = null
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    } else getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification())
  }

  private fun expire() {
    onStopped?.invoke()
    jobs.clear()
    if (instance === this) instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onTimeout(startId: Int, fgsType: Int) { expire() }
  override fun onBind(intent: Intent?) = null
  override fun onTaskRemoved(rootIntent: Intent?) { expire() }
  override fun onDestroy() {
    if (jobs.isNotEmpty() && instance === this) onStopped?.invoke()
    handler.removeCallbacksAndMessages(null)
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
    if (instance === this) instance = null
    super.onDestroy()
  }
}
