import Foundation
import UIKit
import Capacitor
import SpotifyiOS

/// Lets Spin Studio start, pause and resume songs in the Spotify app without leaving the app.
/// Spotify's App Remote keeps the Spotify app alive in the background while connected.
@objc(SpotifyRemotePlugin)
public class SpotifyRemotePlugin: CAPPlugin, CAPBridgedPlugin, SPTAppRemoteDelegate {
    public let identifier = "SpotifyRemotePlugin"
    public let jsName = "SpotifyRemote"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "handleUrl", returnType: CAPPluginReturnPromise)
    ]

    private static let tokenKey = "spin-studio.spotify.appremote.token"

    private var appRemote: SPTAppRemote?
    private var waiting: [CAPPluginCall] = []
    private var attemptUri = ""
    private var triedAuthorize = false
    private var stage = "starting"
    private var timeout: DispatchWorkItem?

    // MARK: setup

    @objc func configure(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty,
              let redirect = call.getString("redirectUri"), let redirectUrl = URL(string: redirect) else {
            call.reject("Missing Spotify client ID or redirect URI.")
            return
        }
        DispatchQueue.main.async {
            let configuration = SPTConfiguration(clientID: clientId, redirectURL: redirectUrl)
            let remote = SPTAppRemote(configuration: configuration, logLevel: .debug)
            remote.delegate = self
            if let saved = UserDefaults.standard.string(forKey: Self.tokenKey) {
                remote.connectionParameters.accessToken = saved
            }
            self.appRemote = remote
            call.resolve()
        }
    }

    @objc func isConnected(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["connected": self.appRemote?.isConnected ?? false])
        }
    }

    // MARK: connecting

    /// Connects to the Spotify app. The first time (or when the saved token is stale) this
    /// switches to Spotify for a moment to approve, then returns here by itself.
    @objc func connect(_ call: CAPPluginCall) {
        let uri = call.getString("uri") ?? ""
        DispatchQueue.main.async {
            self.ensureConnected(uri: uri, call: call) { call.resolve(["connected": true]) }
        }
    }

    private func ensureConnected(uri: String, call: CAPPluginCall, then done: @escaping () -> Void) {
        guard let remote = appRemote else {
            call.reject("Spotify remote is not configured.")
            return
        }
        if remote.isConnected {
            done()
            return
        }
        bridge?.saveCall(call)
        pendingDone[call.callbackId] = done
        waiting.append(call)
        if waiting.count > 1 { return }
        attemptUri = uri
        triedAuthorize = false
        armTimeout()
        let hasToken = !(remote.connectionParameters.accessToken ?? "").isEmpty
        if hasToken {
            stage = "connecting with saved token"
            print("[SpotifyRemote] connect with saved token")
            remote.connect()
        } else {
            authorize()
        }
    }

    private var pendingDone: [String: () -> Void] = [:]

    private func authorize() {
        guard let remote = appRemote else { return }
        triedAuthorize = true
        if let spotifyUrl = URL(string: "spotify:"), !UIApplication.shared.canOpenURL(spotifyUrl) {
            failWaiting("The Spotify app is not installed on this iPhone.")
            return
        }
        stage = "asked Spotify to authorize"
        print("[SpotifyRemote] authorizeAndPlayURI \(attemptUri)")
        DispatchQueue.main.async {
            _ = remote.authorizeAndPlayURI(self.attemptUri)
        }
    }

    private func armTimeout() {
        timeout?.cancel()
        let item = DispatchWorkItem { [weak self] in
            let where_ = self?.stage ?? ""
            self?.failWaiting("Spotify did not answer (stopped at: \(where_)). Open the Spotify app once, then try again.")
        }
        timeout = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: item)
    }

    private func finishWaiting() {
        timeout?.cancel()
        let calls = waiting
        waiting = []
        for call in calls {
            let done = pendingDone.removeValue(forKey: call.callbackId)
            bridge?.releaseCall(call)
            done?()
        }
    }

    private func failWaiting(_ message: String) {
        timeout?.cancel()
        let calls = waiting
        waiting = []
        for call in calls {
            pendingDone.removeValue(forKey: call.callbackId)
            bridge?.releaseCall(call)
            call.reject(message)
        }
    }

    /// Called with the link Spotify opens after the user approved.
    @objc func handleUrl(_ call: CAPPluginCall) {
        guard let text = call.getString("url"), let url = URL(string: text) else {
            call.reject("Missing url.")
            return
        }
        DispatchQueue.main.async {
            guard let remote = self.appRemote else {
                call.reject("Spotify remote is not configured.")
                return
            }
            print("[SpotifyRemote] handleUrl \(url.absoluteString)")
            self.stage = "got link back from Spotify"
            let parameters = remote.authorizationParameters(from: url)
            if let token = parameters?[SPTAppRemoteAccessTokenKey] {
                remote.connectionParameters.accessToken = token
                UserDefaults.standard.set(token, forKey: Self.tokenKey)
                remote.connect()
                call.resolve()
            } else {
                let message = parameters?[SPTAppRemoteErrorDescriptionKey] ?? "Spotify did not give access."
                self.failWaiting(message)
                call.reject(message)
            }
        }
    }

    // MARK: playing

    @objc func play(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri") else {
            call.reject("Missing uri.")
            return
        }
        let positionMs = Int((call.getDouble("positionSec") ?? 0) * 1000)
        DispatchQueue.main.async {
            self.ensureConnected(uri: uri, call: call) {
                guard let api = self.appRemote?.playerAPI else {
                    call.reject("Spotify is not ready.")
                    return
                }
                api.play(uri, callback: { _, error in
                    if let error = error {
                        call.reject(error.localizedDescription)
                        return
                    }
                    if positionMs > 500 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            self.appRemote?.playerAPI?.seek(toPosition: positionMs, callback: { _, _ in })
                        }
                    }
                    call.resolve()
                })
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let remote = self.appRemote, remote.isConnected, let api = remote.playerAPI else {
                call.resolve()
                return
            }
            api.pause({ _, error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
            })
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let remote = self.appRemote, remote.isConnected, let api = remote.playerAPI else {
                call.reject("Spotify is not connected.")
                return
            }
            api.resume({ _, error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
            })
        }
    }

    // MARK: SPTAppRemoteDelegate

    public func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
        print("[SpotifyRemote] connected")
        finishWaiting()
        notifyListeners("connectionChanged", data: ["connected": true])
    }

    public func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
        print("[SpotifyRemote] connection failed: \(String(describing: error))")
        if !waiting.isEmpty && !triedAuthorize {
            // The saved token is old or Spotify was not running: ask again, which wakes Spotify.
            authorize()
        } else {
            failWaiting(error?.localizedDescription ?? "Could not connect to Spotify.")
        }
    }

    public func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
        notifyListeners("connectionChanged", data: ["connected": false])
    }
}
