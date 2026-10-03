package pt.neochat.app;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

/**
 * Cliente Socket.IO para o servidor NEOCHAT.
 *
 * Eventos usados (ver server.js):
 *   cliente -> servidor : join, message, irc-connect, irc-message,
 *                        mesh-node-join, mesh-broadcast
 *   servidor -> cliente : connect, disconnect, channel-info, message,
 *                        user-joined, error, irc-status, mesh-*
 */
public final class ChatClient {

    public interface Listener {
        void onConnected();
        void onDisconnected();
        void onConnectError(String message);
        void onChannelInfo(String channelId, int members, boolean encrypted);
        void onMessage(String from, String content, long timestamp, boolean encrypted);
        void onUserJoined(String nickname);
        void onIrcStatus(String status, String detail);
        void onMeshEvent(String type, String detail);
    }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private Socket socket;
    private final Listener listener;
    private long latencyMs = 0L;

    public ChatClient(Listener listener) {
        this.listener = listener;
    }

    public long latencyMs() {
        return latencyMs;
    }

    /** Liga ao servidor e entra no canal. */
    public void connect(String serverUrl, String channelId, String nickname,
                        String publicKey, boolean encrypted) throws Exception {
        disconnect();

        IO.Options opts = IO.Options.builder()
                .setTransports(new String[]{"websocket"})
                .setReconnection(true)
                .setReconnectionAttempts(0)      // tentar para sempre
                .setReconnectionDelay(2000)
                .setTimeout(15000)
                .build();

        socket = IO.socket(serverUrl, opts);

        socket.on(Socket.EVENT_CONNECT, args -> {
            latencyMs = System.currentTimeMillis() - (startTs > 0 ? startTs : System.currentTimeMillis());
            startTs = 0;
            ui.post(() -> {
                listener.onConnected();
                // Entrar no canal imediatamente apos ligar
                JSONObject join = new JSONObject();
                try {
                    join.put("channelId", channelId);
                    join.put("nickname", nickname);
                    join.put("publicKey", publicKey);
                    join.put("encrypted", encrypted);
                } catch (Exception ignored) {
                }
                socket.emit("join", join);
            });
        });

        socket.on(Socket.EVENT_DISCONNECT, args ->
                ui.post(() -> listener.onDisconnected()));

        socket.on(Socket.EVENT_CONNECT_ERROR, args -> {
            String msg = args.length > 0 && args[0] != null ? String.valueOf(args[0]) : "erro desconhecido";
            ui.post(() -> listener.onConnectError(msg));
        });

        socket.on("channel-info", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            int members = 0;
            JSONArray arr = o.optJSONArray("members");
            if (arr != null) {
                members = arr.length();
            }
            listener.onChannelInfo(
                    o.optString("channelId", ""),
                    members,
                    o.optBoolean("encrypted", false));
        }));

        socket.on("message", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onMessage(
                    o.optString("from", "anon"),
                    o.optString("content", ""),
                    o.optLong("timestamp", System.currentTimeMillis()),
                    o.optBoolean("encrypted", false));
        }));

        socket.on("user-joined", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onUserJoined(o.optString("nickname", "anon"));
        }));

        socket.on("error", (Emitter.Listener) args -> ui.post(() -> {
            Object a = args.length > 0 ? args[0] : null;
            String s;
            if (a instanceof JSONObject) {
                s = ((JSONObject) a).optString("message", "erro");
            } else {
                s = a != null ? String.valueOf(a) : "erro";
            }
            listener.onIrcStatus("erro", s);
        }));

        socket.on("irc-status", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onIrcStatus(
                    o.optString("status", "?"),
                    o.optString("message", ""));
        }));

        socket.on("mesh-protocol", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onMeshEvent("protocolo", o.optString("version", "?"));
        }));
        socket.on("mesh-node-joined", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onMeshEvent("no_entrou", o.optString("nickname", "node"));
        }));
        socket.on("mesh-node-left", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onMeshEvent("no_saiu", o.optString("nickname", "node"));
        }));
        socket.on("mesh-broadcast", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onMeshEvent("broadcast", o.optString("content", ""));
        }));
        socket.on("mesh-route", (Emitter.Listener) args -> ui.post(() -> {
            JSONObject o = (JSONObject) args[0];
            listener.onMeshEvent("rota", o.optString("status", "?"));
        }));

        startTs = System.currentTimeMillis();
        socket.connect();
    }

    private long startTs = 0L;

    /** Envia mensagem (encriptada se o canal for E2E). */
    public void send(String channelId, String content, String nonce,
                     String signature, String type) {
        if (socket == null) {
            return;
        }
        JSONObject m = new JSONObject();
        try {
            m.put("channelId", channelId);
            m.put("content", content);
            m.put("nonce", nonce);
            m.put("signature", signature);
            m.put("type", type);
        } catch (Exception ignored) {
        }
        socket.emit("message", m);
    }

    /** Liga a uma ponte IRC. */
    public void ircConnect(String server, int port, String nickname,
                           String channel, String source) {
        if (socket == null) {
            return;
        }
        JSONObject m = new JSONObject();
        try {
            m.put("server", server);
            m.put("port", port);
            m.put("nickname", nickname);
            m.put("channel", channel);
            m.put("source", source);
        } catch (Exception ignored) {
        }
        socket.emit("irc-connect", m);
    }

    public void meshJoin(String nodeName) {
        if (socket == null) {
            return;
        }
        JSONObject m = new JSONObject();
        try {
            m.put("nodeName", nodeName);
            m.put("nodeType", "mobile");
        } catch (Exception ignored) {
        }
        socket.emit("mesh-node-join", m);
    }

    public void meshBroadcast(String content) {
        if (socket == null) {
            return;
        }
        JSONObject m = new JSONObject();
        try {
            m.put("content", content);
            m.put("type", "encrypted");
        } catch (Exception ignored) {
        }
        socket.emit("mesh-broadcast", m);
    }

    public boolean isConnected() {
        return socket != null && socket.connected();
    }

    public void disconnect() {
        if (socket != null) {
            socket.off();
            socket.disconnect();
            socket.close();
            socket = null;
        }
    }
}
