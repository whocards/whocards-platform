package expo.modules.themecrossfade

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import android.view.View
import android.view.inspector.WindowInspector
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ThemeCrossfadeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ThemeCrossfade")

    // Fades one snapshot of every app window (an open sheet's dialog included) off the new Theme.
    AsyncFunction("crossfade") { durationMs: Double ->
      val roots = windowRoots().filter { it.isShown && it.width > 0 && it.height > 0 }
      val top = roots.lastOrNull() ?: return@AsyncFunction
      val topAt = IntArray(2).also { top.getLocationOnScreen(it) }
      val bitmap = Bitmap.createBitmap(top.width, top.height, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      val at = IntArray(2)
      for (root in roots) {
        root.getLocationOnScreen(at)
        canvas.save()
        canvas.translate((at[0] - topAt[0]).toFloat(), (at[1] - topAt[1]).toFloat())
        root.draw(canvas)
        canvas.restore()
      }
      // One composite in the top window, so a sheet's translucent scrim is never drawn twice.
      val snapshot = BitmapDrawable(top.resources, bitmap).apply { setBounds(0, 0, top.width, top.height) }
      top.overlay.add(snapshot)
      ValueAnimator.ofInt(255, 0).apply {
        duration = durationMs.toLong()
        // A short hold lets React commit the new Theme before the old one starts to fade.
        startDelay = 60
        addUpdateListener { snapshot.alpha = it.animatedValue as Int }
        addListener(object : AnimatorListenerAdapter() {
          override fun onAnimationEnd(animation: Animator) {
            top.overlay.remove(snapshot)
            bitmap.recycle()
          }
        })
        start()
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun windowRoots(): List<View> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      WindowInspector.getGlobalWindowViews()
    } else {
      listOfNotNull(appContext.currentActivity?.window?.decorView)
    }
}
