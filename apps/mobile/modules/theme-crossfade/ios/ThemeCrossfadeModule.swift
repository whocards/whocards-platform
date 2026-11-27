import ExpoModulesCore
import UIKit

public class ThemeCrossfadeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ThemeCrossfade")

    // Fades a snapshot of the key window (open sheet included) off the new Theme; touches pass through.
    AsyncFunction("crossfade") { (durationMs: Double) in
      guard
        let window = UIApplication.shared.connectedScenes
          .compactMap({ $0 as? UIWindowScene })
          .flatMap({ $0.windows })
          .first(where: { $0.isKeyWindow }),
        let snapshot = window.snapshotView(afterScreenUpdates: false)
      else { return }
      snapshot.isUserInteractionEnabled = false
      window.addSubview(snapshot)
      // A short hold lets React commit the new Theme before the old one starts to fade.
      UIView.animate(
        withDuration: durationMs / 1000,
        delay: 0.06,
        options: [.curveEaseInOut, .allowUserInteraction],
        animations: { snapshot.alpha = 0 },
        completion: { _ in snapshot.removeFromSuperview() }
      )
    }.runOnQueue(.main)
  }
}
