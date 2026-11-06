// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpotifyRemote",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SpotifyRemote",
            targets: ["SpotifyRemotePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/spotify/ios-sdk.git", from: "2.1.1")
    ],
    targets: [
        .target(
            name: "SpotifyRemotePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "SpotifyiOS", package: "ios-sdk")
            ],
            path: "ios/Sources/SpotifyRemotePlugin")
    ]
)
