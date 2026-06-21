// @testing-library/react-native 13+ automatically extends jest matchers
// when you import from it in a test — no explicit extend-expect import needed.

// Gesture handler needs its jest shims loaded before any component under test
// that imports react-native-gesture-handler.
import 'react-native-gesture-handler/jestSetup'
