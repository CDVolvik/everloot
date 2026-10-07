# ios/

Native Swift + SwiftUI iOS app — the primary mobile surface.

**Status**: empty. Scaffolded in `BUILD_PLAN.md` Session 5 (Battle.net OAuth on iOS) onward.

**Built on**: MacBook Air with Xcode 15+. Cannot be developed from Windows.

**First file to land here**: `Everloot.xcodeproj` from `xcodebuild` or "File → New Project → iOS App" in Xcode. Bundle ID suggestion: `com.r21digital.everloot`.

**Auth**: `ASWebAuthenticationSession` for Battle.net OAuth. Tokens in Keychain, never UserDefaults.

**First screen**: `MissingMountsView` (Session 6) — server-rendered diff of `mount_library` minus `collection_items`.
